/**
 * Port abstracting the execution of an external command. Used by the
 * `shell.exec` runner — kept behind an interface so tests can swap a fake
 * gateway in without spawning real processes, and so the application layer
 * remains free of `child_process` imports.
 *
 * The adapter is responsible for:
 *  - spawning the process with the requested `cwd` / `env` / `shell` flag,
 *  - draining stdout/stderr into bounded buffers (truncate beyond
 *    `maxOutputBytes`, but keep reading to avoid blocking the pipe),
 *  - enforcing `timeoutMs` via `SIGTERM` then `SIGKILL` two seconds later,
 *  - measuring `durationMs`.
 *
 * `cwd` is expected to be **absolute** and already validated by the caller
 * (the runner enforces it lives inside `workspace.cwd`).
 */

export type ShellRunRequest = {
  /** Command to run. `string` only meaningful with `useShell: true`. */
  command: string | ReadonlyArray<string>;
  /** When true, the command is passed to `/bin/sh -c`; otherwise execve-style. */
  useShell: boolean;
  /** Absolute path. Must already exist and be inside the workspace. */
  cwd: string;
  /** Environment passed to the child. Caller-built (no implicit inheritance). */
  env: NodeJS.ProcessEnv;
  /** Max wall-clock duration before SIGTERM. Strictly positive. */
  timeoutMs: number;
  /** Per-stream max captured bytes. Beyond this, output is truncated. */
  maxOutputBytes: number;
  /** Optional content piped to the child's stdin. */
  stdin?: string;
};

/**
 * `exitCode` carries the actual integer when the process exits normally, the
 * literal `"timeout"` when we killed it for exceeding `timeoutMs`, and
 * `"killed"` for any other signal-induced termination.
 */
export type ShellRunResult = {
  exitCode: number | "timeout" | "killed";
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: { stdout: boolean; stderr: boolean };
  durationMs: number;
};

export interface ShellGateway {
  run(req: ShellRunRequest): Promise<ShellRunResult>;
}
