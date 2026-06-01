/**
 * Pure formatters for `shell.exec` outputs. The runner emits three Markdown
 * artifacts per run:
 *  - a one-line branch summary on `success` XOR `failure` ({@link renderBranchSummary}),
 *  - the verbatim `stdout` and `stderr` streams ({@link formatStream}).
 *
 * Exit code, signal, duration and cwd live in each artifact's metadata, not
 * the body. Kept separate from the runner so they can be tested without
 * spawning processes or touching artifact IO.
 */
import type { ShellRunResult } from "../application/ports/outbound/shell-gateway";

/**
 * Wrap a payload in a code fence whose length is one greater than the
 * longest run of backticks found inside it. Prevents user output from
 * closing the fence early.
 */
const fenceFor = (payload: string): string => {
  let longest = 2;
  const re = /`+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(payload)) !== null) {
    if (m[0].length > longest) longest = m[0].length;
  }
  return "`".repeat(longest + 1);
};

/**
 * Render one stream (stdout or stderr) verbatim inside a code fence. Empty
 * streams collapse to a `_(no output)_` marker, or `_… [output truncated]_`
 * when the stream was cut at `maxOutputBytes` before any byte survived.
 */
export const formatStream = (raw: string, truncated: boolean): string => {
  if (raw.length === 0) {
    return truncated ? "_… [output truncated]_\n" : "_(no output)_\n";
  }
  const fence = fenceFor(raw);
  const tail = truncated ? "\n\n_… [output truncated]_" : "";
  return `${fence}\n${raw}\n${fence}${tail}\n`;
};

/**
 * Render the short branch summary carried by the emitted branch port. The
 * useful content lives on `stdout` / `stderr`; this is just the verdict.
 *
 * The `port` argument is informational only: for the legacy `success`
 * branch we emit the canonical `"Exit 0"` line; otherwise we surface the
 * actual exit code (and signal, when present). Custom port names from
 * `exitCodes` configs go through the second path — the port name itself is
 * carried by the artifact metadata, so the body stays portable.
 */
export const renderBranchSummary = (
  port: string,
  result: ShellRunResult,
): string => {
  if (port === "success" && result.exitCode === 0 && !result.signal) {
    return "Exit 0\n";
  }
  const parts = [`Exit ${String(result.exitCode)}`];
  if (result.signal) parts.push(`Signal ${result.signal}`);
  return parts.join(" — ") + "\n";
};
