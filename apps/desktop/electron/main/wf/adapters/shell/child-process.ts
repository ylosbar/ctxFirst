/**
 * `ShellGateway` adapter backed by Node's `child_process.spawn`. Implements
 * the bounded capture + timeout semantics described in the port docstring:
 *
 *  - Drains stdout/stderr fully (so the child never blocks on `write()`) but
 *    only retains the first `maxOutputBytes` per stream — past that point the
 *    chunks are dropped and `truncated.{stdout|stderr}` flips to `true`.
 *  - Uses `SIGTERM` after `timeoutMs`, then `SIGKILL` two seconds later if
 *    the process is still alive. Stdin (if any) is piped before the timer
 *    starts.
 *  - Never throws on a non-zero exit; surfaces it via `exitCode`. Spawn
 *    failures (ENOENT etc.) are exposed as `exitCode: "killed"` so the runner
 *    can format a meaningful report instead of crashing the step.
 */
import { spawn } from "node:child_process";
import type {
  ShellGateway,
  ShellRunRequest,
  ShellRunResult,
} from "../../application/ports/outbound/shell-gateway";

const KILL_GRACE_MS = 2000;

/**
 * Bounded byte accumulator: keeps the first `limit` bytes verbatim and
 * remembers whether anything was dropped. Decoding to UTF-8 happens once,
 * at the end, to avoid breaking multibyte sequences mid-stream.
 */
const createBoundedSink = (limit: number) => {
  const chunks: Buffer[] = [];
  let stored = 0;
  let truncated = false;
  return {
    push(chunk: Buffer): void {
      if (stored >= limit) {
        truncated = true;
        return;
      }
      const remaining = limit - stored;
      if (chunk.length <= remaining) {
        chunks.push(chunk);
        stored += chunk.length;
      } else {
        chunks.push(chunk.subarray(0, remaining));
        stored += remaining;
        truncated = true;
      }
    },
    finish(): { text: string; truncated: boolean } {
      return {
        text: Buffer.concat(chunks).toString("utf8"),
        truncated,
      };
    },
  };
};

export const createChildProcessShellGateway = (): ShellGateway => ({
  run(req: ShellRunRequest): Promise<ShellRunResult> {
    return new Promise<ShellRunResult>((resolve) => {
      const started = Date.now();
      const stdoutSink = createBoundedSink(req.maxOutputBytes);
      const stderrSink = createBoundedSink(req.maxOutputBytes);

      let timedOut = false;
      let killTimer: NodeJS.Timeout | null = null;

      // Build the spawn args: in shell mode we pass a single command string;
      // otherwise we expect a non-empty argv array.
      let argv0: string;
      let args: ReadonlyArray<string>;
      if (req.useShell) {
        argv0 =
          typeof req.command === "string" ? req.command : req.command.join(" ");
        args = [];
      } else {
        if (typeof req.command === "string") {
          // Defensive — the runner normalizes this, but keep a path that
          // doesn't crash if it slips through. Split on whitespace,
          // dropping empty fragments.
          const tokens = req.command.split(/\s+/).filter(Boolean);
          argv0 = tokens[0] ?? "";
          args = tokens.slice(1);
        } else {
          argv0 = req.command[0] ?? "";
          args = req.command.slice(1);
        }
      }

      // On POSIX, run the child in its own process group so we can signal the
      // whole tree on timeout. Without this, killing a `sh -c "..."` parent
      // leaves grandchildren (e.g. `sleep`) orphaned, still holding the
      // inherited stdout/stderr pipes — `close` then waits for them to exit
      // naturally, defeating the whole timeout mechanism.
      const usePgroup = process.platform !== "win32";
      const child = spawn(argv0, args, {
        cwd: req.cwd,
        env: req.env,
        shell: req.useShell,
        stdio: ["pipe", "pipe", "pipe"],
        detached: usePgroup,
      });

      const killTree = (signal: NodeJS.Signals) => {
        if (usePgroup && typeof child.pid === "number") {
          try {
            process.kill(-child.pid, signal);
            return;
          } catch {
            // Group already gone — fall through to direct kill below.
          }
        }
        try {
          child.kill(signal);
        } catch {
          // Already dead.
        }
      };

      child.stdout?.on("data", (chunk: Buffer) => stdoutSink.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderrSink.push(chunk));

      // Pipe stdin if requested. Errors are swallowed: a process that closed
      // stdin early shouldn't fail the whole step.
      if (req.stdin && child.stdin) {
        child.stdin.on("error", () => {});
        child.stdin.end(req.stdin);
      } else {
        child.stdin?.end();
      }

      const timer = setTimeout(() => {
        timedOut = true;
        killTree("SIGTERM");
        killTimer = setTimeout(() => {
          killTree("SIGKILL");
        }, KILL_GRACE_MS);
      }, req.timeoutMs);

      const finalize = (
        exitCode: number | "timeout" | "killed",
        signal: NodeJS.Signals | null,
      ) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        const stdout = stdoutSink.finish();
        const stderr = stderrSink.finish();
        resolve({
          exitCode,
          signal,
          stdout: stdout.text,
          stderr: stderr.text,
          truncated: { stdout: stdout.truncated, stderr: stderr.truncated },
          durationMs: Date.now() - started,
        });
      };

      child.on("error", (err) => {
        // Spawn failure (ENOENT, EACCES…). Surface the message via stderr so
        // the report is actionable without leaking a JS stack trace.
        stderrSink.push(Buffer.from(`spawn error: ${err.message}\n`, "utf8"));
        finalize("killed", null);
      });

      child.on("close", (code, signal) => {
        if (timedOut) {
          finalize("timeout", signal);
          return;
        }
        if (code === null) {
          finalize("killed", signal);
          return;
        }
        finalize(code, signal);
      });
    });
  },
});
