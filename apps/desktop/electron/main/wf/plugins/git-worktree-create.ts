/**
 * Runner du step kind "git.worktree.create".
 *
 * Crée un worktree git dédié (+ branche) et pose le `cwd` du run dessus via
 * l'outcome `workspace-set` — toutes les steps en aval tournent ensuite
 * automatiquement dans le worktree, sans connaître son chemin.
 *
 * Idempotent : si `git worktree add` échoue et que la porcelain confirme un
 * worktree existant pointant sur la bonne branche, le runner renvoie quand
 * même `workspace-set` (cas de replay).
 */
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import {
  resolveContained,
  runGit,
  validateBranchName,
  worktreeBranchAt,
} from "./git-exec";

type WorktreeCreateConfig = {
  repoDir: string;
  branch: string;
  baseRef: string;
  worktreesDir: string;
};

const parseConfig = (cfg: Readonly<Record<string, unknown>>): WorktreeCreateConfig => {
  const repoDir = typeof cfg["repoDir"] === "string" ? cfg["repoDir"].trim() : "";
  if (!repoDir) {
    throw new Error(
      "git.worktree.create: `repoDir` is required (absolute path to the git repo)",
    );
  }
  const branch = validateBranchName(cfg["branch"]);
  const baseRef =
    typeof cfg["baseRef"] === "string" && cfg["baseRef"].trim().length > 0
      ? cfg["baseRef"].trim()
      : "HEAD";
  const worktreesDir =
    typeof cfg["worktreesDir"] === "string" && cfg["worktreesDir"].trim().length > 0
      ? cfg["worktreesDir"].trim()
      : ".worktrees";
  return { repoDir, branch, baseRef, worktreesDir };
};

/** `/` → `__` so `wf/instance-123` lands as `wf__instance-123` on disk. */
const slugify = (branch: string): string => branch.replace(/\//g, "__");

export const createGitWorktreeCreateRunner = (): StepRunner => ({
  kind: "git.worktree.create",

  resolveSpec(): NodeSpec {
    return {
      title: "Git Worktree Create",
      description:
        "Creates a dedicated git worktree (+ branch) and sets the run's cwd to it.",
      inputs: [{ name: "in", kinds: ["*"], optional: true }],
      outputs: [],
      passthrough: true,
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = parseConfig(ctx.step.config);
    const repoAbs = ctx.deps.path.resolve(cfg.repoDir);
    // G2-git: containment is checked in two hops so a `worktreesDir`
    // containing `..` is caught immediately, not silently absorbed when
    // the second segment lands back inside `repoDir`.
    const worktreesAbs = resolveContained(repoAbs, cfg.worktreesDir, ctx.deps.path);
    const worktreePath = resolveContained(
      worktreesAbs,
      slugify(cfg.branch),
      ctx.deps.path,
    );

    const addResult = await runGit(ctx, repoAbs, [
      "worktree",
      "add",
      "-b",
      cfg.branch,
      worktreePath,
      cfg.baseRef,
    ]);

    if (addResult.exitCode === 0) {
      return { kind: "workspace-set", cwd: worktreePath };
    }

    // Replay path: `git worktree add` typically fails with "already exists"
    // when re-running. Confirm via porcelain that we actually own the
    // expected worktree before treating the failure as benign — a mismatch
    // (different branch) is a real config error and must surface.
    const existing = await worktreeBranchAt(ctx, repoAbs, worktreePath);
    if (existing === cfg.branch) {
      return { kind: "workspace-set", cwd: worktreePath };
    }
    if (existing !== null) {
      throw new Error(
        `git.worktree.create: ${worktreePath} already exists but tracks "${existing}" (expected "${cfg.branch}")`,
      );
    }

    const tail =
      addResult.stderr.length > 2048
        ? addResult.stderr.slice(-2048)
        : addResult.stderr;
    throw new Error(
      `git.worktree.create: \`git worktree add\` failed (exit ${String(addResult.exitCode)}) in ${repoAbs}` +
        (tail ? `\n--- stderr (tail) ---\n${tail}` : ""),
    );
  },
});
