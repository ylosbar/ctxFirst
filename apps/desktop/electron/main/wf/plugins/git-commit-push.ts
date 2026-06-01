/**
 * Runner du step kind "git.commit_push".
 *
 * Stage exclusivement les `paths` explicites de la config, commit, rebase
 * sur la remote, push en `--force-with-lease`, et route le résultat sur
 * l'un de trois ports : `pushed` | `conflict` | `nothing`.
 *
 * Le mécanisme `produced-on-port` (cf. step-runner.ts) garantit que les
 * steps en aval reliées à un port non produit sont skippées en cascade —
 * c'est exactement ce qu'on attend pour brancher `conflict → human.gate`.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type { Artifact } from "../domain/artifact";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import {
  currentSha,
  isClean,
  runGit,
  runGitOrThrow,
  validateBranchName,
} from "./git-exec";

type CommitPushConfig = {
  paths: ReadonlyArray<string>;
  message: string | null;
  branch: string;
  remote: string;
  maxRetries: number;
};

const DEFAULT_MAX_RETRIES = 3;

const parseConfig = (
  cfg: Readonly<Record<string, unknown>>,
): CommitPushConfig => {
  const rawPaths = cfg["paths"];
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    throw new Error(
      "git.commit_push: `paths` must be a non-empty array of strings",
    );
  }
  const paths: string[] = [];
  for (const p of rawPaths) {
    if (typeof p !== "string" || p.length === 0) {
      throw new Error(
        "git.commit_push: every `paths` entry must be a non-empty string",
      );
    }
    // No `--`-looking literals: prevents a config-injected `--foo` from
    // being interpreted as a git option even though we already add `--`.
    if (p.startsWith("-")) {
      throw new Error(
        `git.commit_push: \`paths\` entry must not start with "-" (${p})`,
      );
    }
    paths.push(p);
  }

  const message =
    typeof cfg["message"] === "string" && cfg["message"].trim().length > 0
      ? cfg["message"]
      : null;

  const branch = validateBranchName(cfg["branch"]);

  const remote =
    typeof cfg["remote"] === "string" && cfg["remote"].trim().length > 0
      ? cfg["remote"].trim()
      : "origin";
  if (remote.startsWith("-")) {
    throw new Error(
      `git.commit_push: \`remote\` must not start with "-" (${remote})`,
    );
  }

  const rawRetries =
    typeof cfg["maxRetries"] === "number" && Number.isFinite(cfg["maxRetries"])
      ? Math.floor(cfg["maxRetries"])
      : DEFAULT_MAX_RETRIES;
  const maxRetries = Math.max(1, Math.min(10, rawRetries));

  return { paths, message, branch, remote, maxRetries };
};

const messageFromInputs = (
  ctx: Parameters<StepRunner["run"]>[0],
  fallback: string | null,
): string => {
  const input = ctx.inputs.find((i) => i.port === "message");
  if (input) {
    if (input.kind !== "Markdown") {
      throw new Error(
        `git.commit_push: input on \`message\` must be Markdown, got ${input.kind}`,
      );
    }
    if (input.payload) {
      const body = (input.payload as ArtifactPayload<"Markdown">).body.trim();
      if (body.length > 0) return body;
    } else if (input.content.length > 0) {
      // Degraded mode (validation off): try to recover the body from raw.
      try {
        const parsed = JSON.parse(input.content) as { body?: unknown };
        if (typeof parsed.body === "string" && parsed.body.trim().length > 0) {
          return parsed.body.trim();
        }
      } catch {
        if (input.content.trim().length > 0) return input.content.trim();
      }
    }
  }
  if (fallback) return fallback;
  throw new Error(
    "git.commit_push: no commit message — wire a Markdown input on `message` or set `config.message`",
  );
};

const renderReport = (params: {
  port: "pushed" | "conflict" | "nothing";
  branch: string;
  remote: string;
  sha: string | null;
  attempts: number;
  lastStderr: string;
}): string => {
  const lines = [
    `# Git Commit & Push — ${params.port}`,
    "",
    `- **Port**: ${params.port}`,
    `- **Branch**: ${params.branch}`,
    `- **Remote**: ${params.remote}`,
    params.sha ? `- **SHA**: ${params.sha}` : null,
    `- **Attempts**: ${params.attempts}`,
  ].filter((l): l is string => l !== null);
  if (params.lastStderr.trim().length > 0) {
    const tail =
      params.lastStderr.length > 1024
        ? params.lastStderr.slice(-1024)
        : params.lastStderr;
    lines.push("", "## stderr (tail)", "", "```", tail.trimEnd(), "```");
  }
  return lines.join("\n") + "\n";
};

const writeReport = async (
  ctx: Parameters<StepRunner["run"]>[0],
  port: "pushed" | "conflict" | "nothing",
  branch: string,
  remote: string,
  sha: string | null,
  attempts: number,
  lastStderr: string,
): Promise<Artifact> => {
  const body = renderReport({
    port,
    branch,
    remote,
    sha,
    attempts,
    lastStderr,
  });
  const payload: ArtifactPayload<"Markdown"> = { format: "markdown", body };
  return putArtifactPayload(ctx.deps.artifactStore, "Markdown", payload, {
    port,
    branch,
    remote,
    attempts: String(attempts),
    sha: sha ?? "",
  });
};

export const createGitCommitPushRunner = (): StepRunner => ({
  kind: "git.commit_push",

  resolveSpec(): NodeSpec {
    return {
      title: "Git Commit & Push",
      description:
        "Stages explicit paths, commits, rebases on the remote, pushes with --force-with-lease.",
      inputs: [{ name: "message", kinds: ["Markdown"], optional: true }],
      outputs: [
        {
          name: "pushed",
          kind: "Markdown",
          primary: true,
          description: "Commit pushed to the remote branch.",
        },
        {
          name: "conflict",
          kind: "Markdown",
          description: "Rebase hit a conflict; aborted. Resolve downstream.",
        },
        {
          name: "nothing",
          kind: "Markdown",
          description: "Working tree clean / already pushed — no-op.",
        },
      ],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = parseConfig(ctx.step.config);
    const cwd = ctx.workspace.cwd?.trim();
    if (!cwd) {
      throw new Error(
        "git.commit_push requires a workspace cwd (place a `git.worktree.create` or `workspace.set` step upstream)",
      );
    }
    const cwdAbs = ctx.deps.path.resolve(cwd);

    // 1. Stage only the explicit paths. `--` closes the option list so a
    //    path starting with `--` (already rejected at parse time) cannot
    //    be re-interpreted as a flag. G4-git.
    await runGitOrThrow(ctx, cwdAbs, ["add", "--", ...cfg.paths]);

    // 2. Idempotence (goal 6): if there's nothing to commit, route to
    //    `nothing`. We check after `add` so a no-op replay (working tree
    //    already clean) takes the same path as a no-op first run.
    if (await isClean(ctx, cwdAbs)) {
      const sha = await currentSha(ctx, cwdAbs);
      const artifact = await writeReport(
        ctx,
        "nothing",
        cfg.branch,
        cfg.remote,
        sha,
        0,
        "",
      );
      return { kind: "produced-on-port", port: "nothing", artifact };
    }

    // 3. Commit. The message comes from the `message` input if wired,
    //    otherwise from config.
    const message = messageFromInputs(ctx, cfg.message);
    await runGitOrThrow(ctx, cwdAbs, ["commit", "-m", message]);

    // 4. fetch → rebase → push loop (bounded by maxRetries — G8-git).
    let lastStderr = "";
    let attempts = 0;
    for (let i = 0; i < cfg.maxRetries; i++) {
      attempts = i + 1;

      const fetched = await runGit(ctx, cwdAbs, [
        "fetch",
        cfg.remote,
        cfg.branch,
      ]);
      if (fetched.exitCode !== 0) {
        // First-push case: the remote branch doesn't exist yet. `fetch`
        // returns non-zero — that's fine, we go straight to push and let
        // it create the ref.
        lastStderr = fetched.stderr;
      } else {
        // Rebase on the freshly-fetched upstream. `--autostash` is
        // defensive: the working tree should already be clean after our
        // commit, but a hook might have introduced new dirt.
        const rebased = await runGit(ctx, cwdAbs, [
          "rebase",
          "--autostash",
          `${cfg.remote}/${cfg.branch}`,
        ]);
        if (rebased.exitCode !== 0) {
          // G5-git: always leave the worktree in a clean, known state.
          await runGit(ctx, cwdAbs, ["rebase", "--abort"]);
          const sha = await currentSha(ctx, cwdAbs);
          const artifact = await writeReport(
            ctx,
            "conflict",
            cfg.branch,
            cfg.remote,
            sha,
            attempts,
            rebased.stderr,
          );
          return { kind: "produced-on-port", port: "conflict", artifact };
        }
      }

      // G1-git: --force-with-lease, never --force. The lease refuses to
      // overwrite a remote ref that moved between fetch and push (e.g.
      // because another concurrent run won the race) — we loop and retry.
      const pushed = await runGit(ctx, cwdAbs, [
        "push",
        "--force-with-lease",
        cfg.remote,
        cfg.branch,
      ]);
      if (pushed.exitCode === 0) {
        const sha = await currentSha(ctx, cwdAbs);
        const artifact = await writeReport(
          ctx,
          "pushed",
          cfg.branch,
          cfg.remote,
          sha,
          attempts,
          "",
        );
        return { kind: "produced-on-port", port: "pushed", artifact };
      }
      lastStderr = pushed.stderr;
    }

    // Retries exhausted. Surface the last stderr (typically the rejected
    // push) so the user can diagnose without having to dig into the run
    // log. The report is appended to the error message — the orchestrator
    // does not have a "throw with artifact" shape.
    const tail =
      lastStderr.length > 2048 ? lastStderr.slice(-2048) : lastStderr;
    throw new Error(
      `git.commit_push: exhausted ${cfg.maxRetries} retries pushing ${cfg.remote}/${cfg.branch}` +
        (tail ? `\n--- stderr (tail) ---\n${tail}` : ""),
    );
  },
});
