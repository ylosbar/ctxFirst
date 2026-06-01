/**
 * In-memory `ShellGateway` used by tests and dev fixtures. The fake matches
 * incoming requests against a registered key (the command stringified the
 * same way the production adapter would log it) and returns the canned
 * result. Unmatched commands fall through to a default builder so callers
 * don't need to enumerate every possible invocation.
 */
import type {
  ShellGateway,
  ShellRunRequest,
  ShellRunResult,
} from "../../application/ports/outbound/shell-gateway";

export const stringifyCommand = (
  command: string | ReadonlyArray<string>,
): string =>
  typeof command === "string" ? command : JSON.stringify(command);

export type FakeShellOptions = {
  scripts?: ReadonlyMap<string, ShellRunResult>;
  /** Called when no script matches; defaults to a successful exit-0 result. */
  fallback?: (req: ShellRunRequest) => ShellRunResult;
  /** Records every observed request — useful for assertions. */
  recorder?: Array<ShellRunRequest>;
};

const defaultFallback = (): ShellRunResult => ({
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  truncated: { stdout: false, stderr: false },
  durationMs: 0,
});

export const createFakeShellGateway = (opts: FakeShellOptions = {}): ShellGateway => ({
  async run(req: ShellRunRequest): Promise<ShellRunResult> {
    opts.recorder?.push(req);
    const key = stringifyCommand(req.command);
    const hit = opts.scripts?.get(key);
    if (hit) return hit;
    return (opts.fallback ?? defaultFallback)(req);
  },
});
