/**
 * Runner du step kind "git.worktree.remove".
 *
 * Side-effect terminal : retire un worktree git et, optionnellement, la
 * branche locale associée. Produit un rapport `Markdown` ; pas de
 * branchement (cleanup de fin de run, l'orchestrateur n'a pas à router).
 *
 * Idempotent best-effort : si la branche est déjà absente, on ne fait pas
 * échouer le step — le but est que ce node puisse être rejoué sans erreur.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import { resolveContained, runGit, runGitOrThrow, validateBranchName } from "./git-exec";

type WorktreeRemoveConfig = {
  repoDir: string;
  worktreePath: string;
  deleteBranch: boolean;
  branch: string | null;
};

const parseConfig = (cfg: Readonly<Record<string, unknown>>): WorktreeRemoveConfig => {
  const repoDir = typeof cfg["repoDir"] === "string" ? cfg["repoDir"].trim() : "";
  if (!repoDir) {
    throw new Error(
      "git.worktree.remove: `repoDir` is required (absolute path to the git repo)",
    );
  }
  const worktreePath =
    typeof cfg["worktreePath"] === "string" ? cfg["worktreePath"].trim() : "";
  if (!worktreePath) {
    throw new Error("git.worktree.remove: `worktreePath` is required");
  }
  const deleteBranch = cfg["deleteBranch"] !== false;
  const branch = deleteBranch ? validateBranchName(cfg["branch"]) : null;
  return { repoDir, worktreePath, deleteBranch, branch };
};

export const createGitWorktreeRemoveRunner = (): StepRunner => ({
  kind: "git.worktree.remove",

  resolveSpec(): NodeSpec {
    return {
      title: "Git Worktree Remove",
      description: "Removes a git worktree and (optionally) its local branch.",
      inputs: [{ name: "in", kinds: ["*"], optional: true }],
      outputs: [{ kind: "Markdown", name: "report" }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = parseConfig(ctx.step.config);
    const repoAbs = ctx.deps.path.resolve(cfg.repoDir);
    // G2-git: refuse to operate on a path that doesn't live under the repo.
    const worktreeAbs = resolveContained(repoAbs, cfg.worktreePath, ctx.deps.path);

    const removed = await runGitOrThrow(ctx, repoAbs, [
      "worktree",
      "remove",
      "--force",
      worktreeAbs,
    ]);

    let branchDeleted = false;
    let branchStderr = "";
    if (cfg.deleteBranch && cfg.branch) {
      const r = await runGit(ctx, repoAbs, ["branch", "-D", cfg.branch]);
      branchDeleted = r.exitCode === 0;
      branchStderr = r.stderr;
      // Idempotence: "not found" is fine on replay; anything else gets
      // surfaced in the report but does NOT fail the step.
    }

    const body =
      [
        `# Git Worktree Remove`,
        ``,
        `- **Worktree**: ${worktreeAbs}`,
        `- **Repo**: ${repoAbs}`,
        cfg.deleteBranch
          ? `- **Branch**: ${cfg.branch} (${branchDeleted ? "deleted" : "skipped/not found"})`
          : `- **Branch**: kept`,
        `- **Worktree remove exit**: ${String(removed.exitCode)}`,
      ].join("\n") +
      (branchStderr.trim().length > 0
        ? `\n\n## branch -D stderr (tail)\n\n\`\`\`\n${
            branchStderr.length > 1024 ? branchStderr.slice(-1024) : branchStderr
          }\n\`\`\`\n`
        : "\n");

    const payload: ArtifactPayload<"Markdown"> = { format: "markdown", body };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        worktree: worktreeAbs,
        repo: repoAbs,
        branchDeleted: String(branchDeleted),
      },
    );
    return { kind: "produced", artifact };
  },
});
