/**
 * Shared helpers for the `git.*` step kinds.
 *
 * Centralises every invocation of git so the three runners stay tiny and
 * the security-critical bits (G3-git argv-only, G6-git bounded timeout, env
 * whitelist) live in exactly one place.
 *
 * Garde-fous (cf. specs/git-steps.md §Garde-fous) :
 *  G1-git  `--force-with-lease`, never `--force` — enforced by callers.
 *  G2-git  worktree containment — see {@link resolveContained}.
 *  G3-git  argv only, env filtered — enforced here.
 *  G6-git  every invocation carries a bounded `timeoutMs`.
 *  G7-git  branch name validation — see {@link validateBranchName}.
 */
import type { PathPort } from "../application/ports/outbound/path";
import type { ShellRunResult } from "../application/ports/outbound/shell-gateway";
import type { RunContext } from "../application/step-runner";
import { buildEnv } from "./shell-env";

/**
 * Replaces the credential in an authenticated HTTPS URL — `//user:<token>@host`
 * — by `//user:***@host`. Applied to **every** string derived from the repo
 * URL before it reaches a log, an error message, or an artifact metadata field
 * (G6-clone: a token must never appear in the run transcript or on disk).
 *
 * Covers both auth shapes we build: `oauth2:<token>@` (GitLab) and
 * `x-access-token:<token>@` (GitHub, §10).
 */
export const redactToken = (s: string): string =>
  s.replace(/(\/\/[^/@:]+:)[^/@]+@/g, "$1***@");

export const DEFAULT_GIT_TIMEOUT_MS = 60_000;
export const MAX_GIT_TIMEOUT_MS = 600_000;
export const MIN_GIT_TIMEOUT_MS = 1_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

const FORBIDDEN_BRANCH_RUNS = /\.\./;

const branchCharIsForbidden = (ch: string): boolean => {
  if (/\s/.test(ch)) return true;
  switch (ch) {
    case "~":
    case "^":
    case ":":
    case "?":
    case "*":
    case "[":
    case "\\":
      return true;
    default:
      return false;
  }
};

/**
 * G7-git branch validator. Refuses anything `git check-ref-format` would
 * reject, plus a small set of characters that are technically legal but
 * unsafe to splice into argv from a template variable: leading `-` (looks
 * like an option), whitespace, control chars, `..` runs, and the
 * `~^:?*[\` set.
 */
export const validateBranchName = (raw: unknown): string => {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("git: `branch` must be a non-empty string");
  }
  const branch = raw.trim();
  if (branch.length === 0) throw new Error("git: `branch` must not be blank");
  if (branch.startsWith("-")) {
    throw new Error(`git: branch name must not start with "-" (${branch})`);
  }
  if (branch.endsWith("/") || branch.endsWith(".")) {
    throw new Error(`git: invalid branch name (${branch})`);
  }
  for (const ch of branch) {
    if (branchCharIsForbidden(ch)) {
      throw new Error(
        `git: branch name contains forbidden character "${ch}" (${branch})`,
      );
    }
  }
  if (FORBIDDEN_BRANCH_RUNS.test(branch)) {
    throw new Error(`git: branch name must not contain ".." (${branch})`);
  }
  return branch;
};

/**
 * Validates `value` (a path) resolves to a location inside `base` (G2-git).
 * Returns the absolute, resolved path. `base` itself counts as inside.
 */
export const resolveContained = (
  base: string,
  value: string,
  pathPort: PathPort,
): string => {
  const baseAbs = pathPort.resolve(base);
  const candidate = pathPort.resolve(baseAbs, value);
  const sep = pathPort.sep;
  const baseWithSep = baseAbs.endsWith(sep) ? baseAbs : baseAbs + sep;
  if (candidate !== baseAbs && !candidate.startsWith(baseWithSep)) {
    throw new Error(
      `git: path "${value}" escapes containing directory "${baseAbs}"`,
    );
  }
  return candidate;
};

const clampTimeout = (raw: number | undefined): number => {
  const v =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.floor(raw)
      : DEFAULT_GIT_TIMEOUT_MS;
  return Math.max(MIN_GIT_TIMEOUT_MS, Math.min(MAX_GIT_TIMEOUT_MS, v));
};

/**
 * Runs `git <args>` in `cwd` via the {@link ShellGateway}, in execve form
 * (G3-git: never `useShell: true`). The caller decides what to do with the
 * exit code — `runGit` itself never throws on non-zero.
 */
export const runGit = async (
  ctx: RunContext,
  cwd: string,
  args: ReadonlyArray<string>,
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<ShellRunResult> => {
  return ctx.deps.shell.run({
    command: ["git", ...args],
    useShell: false,
    cwd,
    env: buildEnv(opts.env, ctx.deps.environment),
    timeoutMs: clampTimeout(opts.timeoutMs),
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  });
};

/**
 * Throws if exit ≠ 0, with stderr tail included. Used for every "this MUST
 * succeed" git call (e.g. `git add`, `git commit`); branches that need to
 * inspect the exit code (`rebase` conflict, push rejection) stay on
 * {@link runGit}.
 */
export const runGitOrThrow = async (
  ctx: RunContext,
  cwd: string,
  args: ReadonlyArray<string>,
  opts: { timeoutMs?: number } = {},
): Promise<ShellRunResult> => {
  const result = await runGit(ctx, cwd, args, opts);
  if (result.exitCode !== 0) {
    const tail =
      result.stderr.length > 2048 ? result.stderr.slice(-2048) : result.stderr;
    throw new Error(
      `git ${args.join(" ")} failed (exit ${String(result.exitCode)}) in ${cwd}` +
        (tail ? `\n--- stderr (tail) ---\n${tail}` : ""),
    );
  }
  return result;
};

/**
 * Clones `repoUrl` into `dest` (an absolute path), optionally on a single
 * `branch`, authenticating with `token` when provided. Runs argv-only through
 * the {@link ShellGateway} (G3-git) with the same bounded env / timeout as
 * {@link runGit}.
 *
 * Auth: the token is spliced into the URL as `https://oauth2:<token>@…`. The
 * {@link ShellGateway} adapter never logs its argv (verified against
 * `child-process.ts`), so the token does not leak into the run transcript;
 * defence-in-depth, every error tail is still passed through
 * {@link redactToken}. After a successful authenticated clone the origin is
 * rewritten **without** the token so no secret persists in `.git/config`.
 *
 * `cwd` must be an existing directory (typically the clone's `baseDir`); git
 * itself creates any missing leading directories of `dest`.
 */
export const runGitClone = async (
  ctx: RunContext,
  opts: {
    repoUrl: string;
    dest: string;
    cwd: string;
    branch?: string;
    token?: string | null;
  },
): Promise<void> => {
  const authUrl = opts.token
    ? opts.repoUrl.replace(/^https:\/\//, `https://oauth2:${opts.token}@`)
    : opts.repoUrl;
  const args = [
    "clone",
    ...(opts.branch ? ["--branch", opts.branch, "--single-branch"] : []),
    authUrl,
    opts.dest,
  ];
  // GIT_TERMINAL_PROMPT=0 + GCM_INTERACTIVE=never: never block on an
  // interactive credential prompt. If auth fails, git exits immediately with a
  // real error instead of hanging until the timeout fires (otherwise a bad/
  // unapplied token is indistinguishable from a slow clone). A clone is also
  // legitimately slower than other git ops, so give it a larger timeout.
  const r = await runGit(ctx, opts.cwd, args, {
    timeoutMs: MAX_GIT_TIMEOUT_MS,
    env: { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
  if (r.exitCode !== 0) {
    const tail = redactToken(
      r.stderr.length > 2048 ? r.stderr.slice(-2048) : r.stderr,
    );
    throw new Error(
      `git.clone: \`git clone\` failed (exit ${String(r.exitCode)}) for ${redactToken(
        opts.repoUrl,
      )}` + (tail ? `\n--- stderr (tail) ---\n${tail}` : ""),
    );
  }
  // §3.3 — scrub the token from the persisted remote on disk.
  if (opts.token) {
    await runGitOrThrow(ctx, opts.dest, [
      "remote",
      "set-url",
      "origin",
      opts.repoUrl,
    ]);
  }
};

/**
 * `rm -rf <target>`, bounded so it can never escape `base` (G2-git). The
 * {@link FileSystemPort} is read-only (writes go through `ArtifactStore`), so
 * destructive cleanup goes through the {@link ShellGateway}, like the rest of
 * the `git.*` family mutates the disk via git.
 *
 * Double guard: (a) `target` re-validated against `base` via
 * {@link resolveContained}, (b) refusing `target === base` so the baseDir
 * itself can never be wiped.
 */
export const rmrfContained = async (
  ctx: RunContext,
  base: string,
  target: string,
): Promise<void> => {
  resolveContained(base, target, ctx.deps.path);
  if (target === ctx.deps.path.resolve(base)) {
    throw new Error("git.clone: refusing to rm the baseDir itself");
  }
  const r = await ctx.deps.shell.run({
    command: ["rm", "-rf", target],
    useShell: false,
    cwd: base,
    env: buildEnv(undefined, ctx.deps.environment),
    timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  });
  if (r.exitCode !== 0) {
    const tail =
      r.stderr.length > 2048 ? r.stderr.slice(-2048) : r.stderr;
    throw new Error(
      `git.clone: \`rm -rf\` failed (exit ${String(r.exitCode)}) for ${target}` +
        (tail ? `\n--- stderr (tail) ---\n${tail}` : ""),
    );
  }
};

/** True when the working tree (incl. index) has no pending change. */
export const isClean = async (ctx: RunContext, cwd: string): Promise<boolean> => {
  const r = await runGitOrThrow(ctx, cwd, ["status", "--porcelain"]);
  return r.stdout.trim().length === 0;
};

/** Resolves the SHA `HEAD` points at; returns `null` if git fails. */
export const currentSha = async (
  ctx: RunContext,
  cwd: string,
): Promise<string | null> => {
  const r = await runGit(ctx, cwd, ["rev-parse", "HEAD"]);
  if (r.exitCode !== 0) return null;
  return r.stdout.trim() || null;
};

/**
 * Parses `git worktree list --porcelain` and returns the short branch ref
 * registered for `worktreePath`, or `null` if no record matches.
 *
 * Format: records separated by blank lines, each made of `key value` or
 * `key` lines:
 *   worktree /abs/path
 *   HEAD <sha>
 *   branch refs/heads/wf/123
 */
export const worktreeBranchAt = async (
  ctx: RunContext,
  repoDir: string,
  worktreePath: string,
): Promise<string | null> => {
  const r = await runGit(ctx, repoDir, ["worktree", "list", "--porcelain"]);
  if (r.exitCode !== 0) return null;
  const records = r.stdout.split(/\n\n+/);
  for (const record of records) {
    let recPath: string | null = null;
    let recBranch: string | null = null;
    for (const line of record.split("\n")) {
      if (line.startsWith("worktree ")) recPath = line.slice("worktree ".length).trim();
      else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length).trim();
        recBranch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      }
    }
    if (recPath === worktreePath) return recBranch;
  }
  return null;
};

