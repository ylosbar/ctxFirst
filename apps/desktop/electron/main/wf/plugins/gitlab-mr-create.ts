/**
 * Step runner `gitlab.mr.create`. Crée une merge request via l'API REST GitLab
 * (`POST /projects/:id/merge_requests`) et émet l'objet MR complet comme
 * artifact `Json` — notamment `iid`, `project_id` et `web_url`, que
 * `gitlab.mr.merge` consomme ensuite.
 *
 * Les champs (`project`, `sourceBranch`, `targetBranch`, `title`,
 * `description`) sont résolus dynamiquement depuis l'input `in` (enveloppe
 * JSON) avec fallback sur la config — même logique que `gitlab.pipeline.wait`,
 * pour pouvoir brancher un nom de branche produit en amont.
 */
import { putArtifactPayload } from "../application/artifact-io";
import {
  groupInputsByPort,
  type NodeSpec,
  type RunContext,
  type StepOutcome,
  type StepRunner,
} from "../application/step-runner";
import {
  encodeProjectId,
  gitlabRequest,
  normalizeBaseUrl,
  resolveGitLabToken,
  type GitLabApiDeps,
} from "./gitlab-api";

const readStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

const readNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const inputPayload = (ctx: RunContext): Record<string, unknown> | null => {
  const input = groupInputsByPort(ctx.inputs).get("in")?.[0];
  return input?.payload && typeof input.payload === "object"
    ? (input.payload as Record<string, unknown>)
    : null;
};

export const createGitlabMrCreateRunner = (
  deps: GitLabApiDeps = {},
): StepRunner => ({
  kind: "gitlab.mr.create",

  resolveSpec(): NodeSpec {
    return {
      title: "GitLab: create MR",
      description:
        "Creates a GitLab merge request and outputs the MR JSON (iid, web_url, project_id).",
      inputs: [{ name: "in", kinds: ["Json", "*"], optional: true }],
      outputs: [
        {
          name: "out",
          kind: "Json",
          description: "The created merge request object.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const payload = inputPayload(ctx);

    const project =
      readStr(payload?.["project"]) ??
      readStr(cfg["project"]) ??
      (readNum(payload?.["project"]) ?? readNum(cfg["project"]))?.toString() ??
      null;
    const sourceBranch =
      readStr(payload?.["sourceBranch"]) ?? readStr(cfg["sourceBranch"]);
    const targetBranch =
      readStr(payload?.["targetBranch"]) ??
      readStr(cfg["targetBranch"]) ??
      "main";
    const title =
      readStr(payload?.["title"]) ??
      readStr(cfg["title"]) ??
      (sourceBranch ? `Merge ${sourceBranch}` : null);
    const description =
      readStr(payload?.["description"]) ?? readStr(cfg["description"]) ?? "";

    if (!project) {
      throw new Error(
        "gitlab.mr.create: missing `project` (numeric id or `group/project` path).",
      );
    }
    if (!sourceBranch) {
      throw new Error("gitlab.mr.create: missing `sourceBranch`.");
    }
    if (!title) {
      throw new Error("gitlab.mr.create: missing `title`.");
    }

    const baseUrl = normalizeBaseUrl(cfg["baseUrl"]);
    const token = resolveGitLabToken(ctx, deps, "gitlab.mr.create");

    ctx.deps.logger.info(
      `[gitlab.mr.create] project=${project} ${sourceBranch} → ${targetBranch} base=${baseUrl}`,
    );

    const res = await gitlabRequest({
      baseUrl,
      token,
      method: "POST",
      path: `/projects/${encodeProjectId(project)}/merge_requests`,
      body: {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        ...(description ? { description } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(
        `gitlab.mr.create: HTTP ${res.status} creating MR (${sourceBranch} → ${targetBranch}): ${res.text.slice(0, 300)}`,
      );
    }

    const mr = (res.json ?? {}) as Record<string, unknown>;
    ctx.deps.logger.info(
      `[gitlab.mr.create] created MR !${String(mr["iid"] ?? "?")} ${String(mr["web_url"] ?? "")}`,
    );

    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Json",
      { format: "json", body: JSON.stringify(mr) },
      {
        source: "gitlab.mr.create",
        project,
        iid: String(mr["iid"] ?? ""),
        webUrl: String(mr["web_url"] ?? ""),
      },
    );
    return { kind: "produced", artifact };
  },
});
