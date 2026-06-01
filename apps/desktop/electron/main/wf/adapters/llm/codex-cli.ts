/**
 * LLM gateway adapter spawning the **Codex** CLI (`codex exec`, OpenAI).
 *
 * Strict mirror of {@link createClaudeCodeLLMGateway} (`./claude-code.ts`): same
 * streaming readline loop, same hard-timeout + SIGKILL handling, same
 * `close`/`exit` double-settle. Only the spawned binary, the CLI args, and the
 * event schema differ — everything is mapped onto the provider-neutral
 * {@link LlmSessionPayload} so the session panel renders Codex exactly like
 * Claude.
 *
 * The event schema is the **item-based** format emitted by `codex exec --json`
 * (NOT the legacy `{ "msg": {...} }` shape). Verified against **codex-cli
 * 0.134.0** — keep the parser tolerant (ignore unknown `type`/`item.type`) so a
 * CLI bump can't crash a run.
 */
import { spawn } from "node:child_process";
import readline from "node:readline";
import type {
  LLMGateway,
  ClaudeCodeInvokeRequest,
  ClaudeCodeInvokeResult,
} from "../../application/ports/outbound/llm-gateway";
import type { LlmSessionPayload } from "../../application/ports/outbound/event-bus";

type Deps = {
  cwd?: string;
  binary?: string;
  /**
   * Default hard timeout (ms) applied when a request does not set its own
   * `timeoutMs`. A codex child that hangs — or that exits without its
   * `close`/`exit` event ever being processed — would otherwise freeze the
   * step forever, since the runner simply `await`s this call.
   */
  defaultTimeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is JsonRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const TOOL_RESULT_TRUNCATE_BYTES = 8 * 1024;

const truncateContent = (content: unknown): unknown => {
  if (typeof content === "string") {
    if (content.length <= TOOL_RESULT_TRUNCATE_BYTES) return content;
    return (
      content.slice(0, TOOL_RESULT_TRUNCATE_BYTES) +
      `\n\n…[+${content.length - TOOL_RESULT_TRUNCATE_BYTES} bytes truncated]`
    );
  }
  if (Array.isArray(content)) return content.map(truncateContent);
  return content;
};

const resolveBinary = (override?: string): string =>
  override ?? (process.platform === "win32" ? "codex.cmd" : "codex");

/**
 * CLI flags — verified against `codex exec --help` (codex-cli 0.134.0). Isolated
 * in a constant so a version bump only touches this list. The model is appended
 * per-call; the prompt is read from stdin (`-`).
 */
const STATIC_ARGS: readonly string[] = [
  "exec",
  "--json", // emit a JSONL stream of typed events
  "--skip-git-repo-check", // cwd may not be a git repo
  "--dangerously-bypass-approvals-and-sandbox", // non-interactive (≈ claude's --dangerously-skip-permissions)
];

/* eslint-disable no-console */
export const createCodexCliLLMGateway = (deps: Deps = {}): LLMGateway => ({
  async invokeStreaming(
    req: ClaudeCodeInvokeRequest,
  ): Promise<ClaudeCodeInvokeResult> {
    const started = Date.now();
    const binary = resolveBinary(deps.binary);
    const args = [...STATIC_ARGS, "-m", req.model, "-"];
    const cwd = req.cwd ?? deps.cwd;
    // `codex exec` has no `--system-prompt` flag. The assembler currently
    // returns systemPrompt = "" (cf. spec §2). If it ever becomes non-empty,
    // prefix it to the user prompt sent on stdin.
    const promptOnStdin =
      req.systemPrompt.length > 0
        ? `${req.systemPrompt}\n\n${req.userPrompt}`
        : req.userPrompt;
    console.log(
      `[wf:llm] spawn ${binary} model=${req.model} sys=${req.systemPrompt.length}ch user=${req.userPrompt.length}ch cwd=${cwd ?? process.cwd()}`,
    );
    const child = spawn(binary, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd,
    });

    let streamedText = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheRead: number | undefined;
    let sessionId: string | undefined;
    let stderrBuf = "";

    const emit = (payload: LlmSessionPayload) => {
      if (req.onEvent) req.onEvent(payload);
    };

    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      stderrBuf += s;
      for (const line of s.split("\n")) {
        if (line.trim()) console.log(`[wf:llm:stderr] ${line}`);
      }
    });

    const timeoutMs =
      req.timeoutMs ?? deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    const done = new Promise<void>((resolve, reject) => {
      let settled = false;
      let spawnFailed = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        // The child is hung (or already exited without delivering `close`):
        // kill the process tree so it can't linger as a zombie, then reject so
        // the orchestrator marks the step failed instead of freezing it.
        console.error(
          `[wf:llm] timeout after ${timeoutMs}ms — killing codex (pid=${child.pid ?? "?"})`,
        );
        try {
          child.kill("SIGKILL");
        } catch {
          /* already dead */
        }
        const trailer = stderrBuf.trim().slice(-400);
        finish(() =>
          reject(
            new Error(
              `codex timed out after ${timeoutMs}ms${trailer ? `\n${trailer}` : ""}`,
            ),
          ),
        );
      }, timeoutMs);

      child.on("error", (err) => {
        spawnFailed = true;
        console.error(`[wf:llm] spawn error: ${err.message}`);
        finish(() =>
          reject(new Error(`Failed to spawn codex CLI: ${err.message}`)),
        );
      });
      child.stdin.end(promptOnStdin);

      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          return;
        }
        if (!isRecord(parsed)) return;
        const evtType = parsed["type"];

        if (evtType === "thread.started") {
          // The event carries neither model nor cwd — reprise them from the
          // request. `thread_id` is captured as the debug-only sessionId.
          const tid = parsed["thread_id"];
          if (typeof tid === "string") sessionId = tid;
          console.log(`[wf:llm] session=${sessionId ?? "?"} start`);
          emit({ type: "session-start", model: req.model, cwd });
          return;
        }

        if (evtType === "item.started" || evtType === "item.completed") {
          const item = parsed["item"];
          if (!isRecord(item)) return;
          const itemType = item["type"];
          const itemId = typeof item["id"] === "string" ? item["id"] : "";

          // A shell command begins → tool-use; finishes → tool-result. Codex
          // emits both `item.started` and `item.completed` for it.
          if (itemType === "command_execution") {
            if (evtType === "item.started") {
              const command =
                typeof item["command"] === "string" ? item["command"] : "";
              console.log(`[wf:llm] tool_use name=command_execution`);
              emit({
                type: "tool-use",
                toolUseId: itemId,
                name: "command_execution",
                input: { command },
              });
            } else {
              const exitCode = item["exit_code"];
              emit({
                type: "tool-result",
                toolUseId: itemId,
                content: truncateContent(item["aggregated_output"]),
                isError: typeof exitCode === "number" && exitCode !== 0,
              });
            }
            return;
          }

          // Text and reasoning arrive complete in a single `item.completed`
          // (no token-by-token deltas). Emit each as one text-delta/thinking;
          // the session panel concatenates deltas, so the render is identical.
          if (evtType === "item.completed") {
            if (
              itemType === "agent_message" &&
              typeof item["text"] === "string"
            ) {
              streamedText += item["text"];
              emit({ type: "text-delta", text: item["text"] });
            } else if (
              itemType === "reasoning" &&
              typeof item["text"] === "string" &&
              item["text"].length > 0
            ) {
              // Only present when reasoning summaries are enabled; absent by default.
              emit({ type: "thinking", text: item["text"] });
            }
          }
          // Other item types (file_change, mcp_tool_call, web_search,
          // todo_list, error…) are ignored in v1 — tolerant parsing.
          return;
        }

        if (evtType === "turn.completed") {
          const usage = parsed["usage"];
          if (isRecord(usage)) {
            const ti = usage["input_tokens"];
            const to = usage["output_tokens"];
            const cr = usage["cached_input_tokens"];
            if (typeof ti === "number") tokensIn = ti;
            if (typeof to === "number") tokensOut = to;
            if (typeof cr === "number") cacheRead = cr;
          }
          const latencyMs = Date.now() - started;
          emit({
            type: "result",
            tokensIn,
            tokensOut,
            cacheRead,
            // Codex does not report a USD cost — leave undefined.
            costUsd: undefined,
            latencyMs,
          });
          return;
        }
      });

      const settleByCode = (code: number | null) => {
        if (spawnFailed) return;
        if (code === 0 || code === null) finish(resolve);
        else {
          const trailer = stderrBuf.trim().slice(-400);
          finish(() =>
            reject(
              new Error(
                `codex exited with code ${code}${trailer ? `\n${trailer}` : ""}`,
              ),
            ),
          );
        }
      };

      // `close` fires once stdio streams are fully flushed, so the readline
      // 'line' handlers have already populated the output — settle on it.
      child.on("close", settleByCode);

      // `exit` fires when the process terminates, before stdout is necessarily
      // drained. It's our safety net: if `close` never arrives, settle shortly
      // after `exit` so the step can't hang forever waiting on `close`.
      child.on("exit", (code) => {
        if (settled || spawnFailed) return;
        setTimeout(() => settleByCode(code), 2000);
      });
    });

    await done;
    const latencyMs = Date.now() - started;
    const output = streamedText;
    console.log(
      `[wf:llm] done outputChars=${output.length} tokensIn=${tokensIn} tokensOut=${tokensOut} cost=-$ latency=${latencyMs}ms`,
    );
    return {
      output,
      tokensIn,
      tokensOut,
      latencyMs,
      costUsd: undefined,
      provider: "codex-cli",
      sessionId,
    };
  },
});
