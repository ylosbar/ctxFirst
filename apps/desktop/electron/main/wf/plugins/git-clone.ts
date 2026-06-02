/**
 * Runner du step kind "git.clone".
 *
 * Clone un repo distant (GitLab via access token, mais provider-agnostique —
 * cf. specs/git-clone-node.md §10) dans un dossier choisi et émet le chemin
 * absolu du clone comme artifact `Path`.
 *
 * Stratégie « toujours propre » : avec `cleanBefore` (défaut), la cible est
 * wipe-and-recloned — rejouer le step redonne exactement le même état
 * (idempotent par construction). Sans `cleanBefore`, on clone seulement si la
 * cible est absente/vide, sinon échec explicite.
 *
 * Sécurité :
 *  - le `rm -rf` et le `clone` sont bornés par {@link resolveContained} (G2) :
 *    impossible d'effacer/écrire hors de `baseDir` ;
 *  - le token est résolu à l'exécution (settings chiffrés, comme Linear /
 *    OpenRouter), jamais en clair dans le template ;
 *  - le token est rédigé dans tout message d'erreur / métadonnée, et l'origin
 *    est réécrit sans token après le clone (cf. {@link runGitClone}).
 */
import type {
  NodeSpec,
  RunContext,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import { putArtifactPayload } from "../application/artifact-io";
import {
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  redactToken,
  resolveContained,
  rmrfContained,
  runGitClone,
  validateBranchName,
} from "./git-exec";
import { buildEnv } from "./shell-env";

type Deps = {
  /** Résout le token GitLab à l'exécution. Précède le fallback env GITLAB_TOKEN. */
  getAccessToken?: () => string | null | undefined;
  /**
   * Racine managée des clones, fournie par le bootstrap (ex.
   * `userData/clones`). Utilisée quand `config.baseDir` est vide. Le bootstrap
   * garantit son existence sur disque.
   */
  defaultBaseDir?: string;
};

type GitCloneConfig = {
  repoUrl: string;
  baseDir: string;
  folder: string;
  branch?: string;
  cleanBefore: boolean;
};

const parseConfig = (
  cfg: Readonly<Record<string, unknown>>,
  defaultBaseDir: string | undefined,
): GitCloneConfig => {
  const repoUrl = typeof cfg["repoUrl"] === "string" ? cfg["repoUrl"].trim() : "";
  if (!repoUrl) {
    throw new Error("git.clone: `repoUrl` is required (HTTPS URL of the repo)");
  }
  if (!repoUrl.startsWith("https://")) {
    throw new Error(
      `git.clone: \`repoUrl\` must start with "https://" (got "${redactToken(repoUrl)}")`,
    );
  }

  const rawBaseDir =
    typeof cfg["baseDir"] === "string" && cfg["baseDir"].trim().length > 0
      ? cfg["baseDir"].trim()
      : (defaultBaseDir ?? "");
  if (!rawBaseDir) {
    throw new Error(
      "git.clone: `baseDir` is required (no managed default was configured)",
    );
  }

  const folder = typeof cfg["folder"] === "string" ? cfg["folder"].trim() : "";
  if (!folder) {
    throw new Error("git.clone: `folder` is required (sub-path of the clone in baseDir)");
  }
  // The real containment guarantee comes from resolveContained; this check is
  // just a clearer error message for the obvious escape attempt.
  if (folder.split(/[\\/]/).includes("..")) {
    throw new Error(`git.clone: \`folder\` must not contain ".." (${folder})`);
  }

  const branch =
    typeof cfg["branch"] === "string" && cfg["branch"].trim().length > 0
      ? validateBranchName(cfg["branch"])
      : undefined;

  const cleanBefore = cfg["cleanBefore"] !== false; // default true

  return { repoUrl, baseDir: rawBaseDir, folder, branch, cleanBefore };
};

/**
 * `ls -A <target>` (argv-only). Returns whether the target directory exists
 * and contains at least one entry — used by the `cleanBefore: false` path to
 * refuse overwriting a non-empty folder. A missing target exits non-zero and
 * counts as "absent".
 */
const targetExistsNonEmpty = async (
  ctx: RunContext,
  base: string,
  target: string,
): Promise<boolean> => {
  const r = await ctx.deps.shell.run({
    command: ["ls", "-A", target],
    useShell: false,
    cwd: base,
    env: buildEnv(undefined, ctx.deps.environment),
    timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  });
  if (r.exitCode !== 0) return false; // target absent (or unreadable) → treat as empty
  return r.stdout.trim().length > 0;
};

export const createGitCloneRunner = (deps: Deps = {}): StepRunner => ({
  kind: "git.clone",

  resolveSpec(): NodeSpec {
    return {
      title: "Git Clone",
      description:
        "Clones a remote git repository (GitLab via access token) into a folder and outputs its path. Wipes the target first when cleanBefore is set.",
      inputs: [{ name: "in", kinds: ["*"], optional: true }],
      outputs: [
        {
          name: "out",
          kind: "Path",
          description: "Absolute path of the cloned repo.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = parseConfig(ctx.step.config, deps.defaultBaseDir);
    // G2: the target is always resolved *inside* baseDir — it can never escape.
    const baseAbs = ctx.deps.path.resolve(cfg.baseDir);
    const target = resolveContained(baseAbs, cfg.folder, ctx.deps.path);

    ctx.deps.logger.info(
      `[git.clone] repo=${redactToken(cfg.repoUrl)} branch=${cfg.branch ?? "(default)"} target=${target} cleanBefore=${cfg.cleanBefore}`,
    );

    if (cfg.cleanBefore) {
      ctx.deps.logger.info(`[git.clone] cleaning target before clone: ${target}`);
      await rmrfContained(ctx, baseAbs, target);
    } else if (await targetExistsNonEmpty(ctx, baseAbs, target)) {
      throw new Error(
        `git.clone: target "${target}" exists and is not empty; set cleanBefore to overwrite`,
      );
    }

    const token =
      deps.getAccessToken?.() ??
      ctx.deps.environment.read(["GITLAB_TOKEN"])["GITLAB_TOKEN"];
    ctx.deps.logger.info(
      `[git.clone] access token ${token ? "resolved" : "MISSING"} (${
        deps.getAccessToken?.() ? "settings" : "env GITLAB_TOKEN"
      })`,
    );

    ctx.deps.logger.info(`[git.clone] starting clone into ${target} …`);
    await runGitClone(ctx, {
      repoUrl: cfg.repoUrl,
      dest: target,
      cwd: baseAbs,
      branch: cfg.branch,
      token,
    });
    ctx.deps.logger.info(`[git.clone] clone completed: ${target}`);

    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Path",
      { path: target },
      {
        provider: "git",
        repoUrl: redactToken(cfg.repoUrl),
        branch: cfg.branch ?? "",
      },
    );
    return { kind: "produced", artifact };
  },
});
