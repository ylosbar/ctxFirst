/**
 * Step runner `gitlab.mr.merge`. Merge une merge request immédiatement via
 * `PUT /projects/:id/merge_requests/:iid/merge`, puis émet la réponse comme
 * artifact `Json`.
 *
 * Cible résolue depuis l'input `mr` (typiquement la sortie de
 * `gitlab.mr.create` : `{ iid, project_id }`), avec fallback sur la config
 * (`project` + `mergeRequestIid`). Merge immédiat uniquement : si la MR n'est
 * pas mergeable (conflits, approvals manquants, pipeline en cours), GitLab
 * renvoie un 405/406 → le step échoue avec le message de l'API.
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
  const input = groupInputsByPort(ctx.inputs).get("mr")?.[0];
  return input?.payload && typeof input.payload === "object"
    ? (input.payload as Record<string, unknown>)
    : null;
};

/** Résout l'id de projet : `project_id` numérique de la MR, sinon `project`. */
const resolveProject = (
  payload: Record<string, unknown> | null,
  cfg: Readonly<Record<string, unknown>>,
): string | null =>
  readNum(payload?.["project_id"])?.toString() ??
  readStr(payload?.["project"]) ??
  readStr(cfg["project"]) ??
  (readNum(payload?.["project"]) ?? readNum(cfg["project"]))?.toString() ??
  null;

const resolveIid = (
  payload: Record<string, unknown> | null,
  cfg: Readonly<Record<string, unknown>>,
): string | null =>
  readNum(payload?.["iid"])?.toString() ??
  readStr(payload?.["iid"]) ??
  readNum(cfg["mergeRequestIid"])?.toString() ??
  readStr(cfg["mergeRequestIid"]) ??
  null;

export const createGitlabMrMergeRunner = (
  deps: GitLabApiDeps = {},
): StepRunner => ({
  kind: "gitlab.mr.merge",

  resolveSpec(): NodeSpec {
    return {
      title: "GitLab: merge MR",
      description:
        "Merges a GitLab merge request immediately and outputs the API response.",
      inputs: [{ name: "mr", kinds: ["Json", "*"], primary: true }],
      outputs: [
        {
          name: "out",
          kind: "Json",
          description: "The merged merge request object.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const payload = inputPayload(ctx);

    const project = resolveProject(payload, cfg);
    const iid = resolveIid(payload, cfg);

    if (!project || !iid) {
      throw new Error(
        "gitlab.mr.merge: missing project/MR iid (wire the `mr` input from gitlab.mr.create, or set config.project + config.mergeRequestIid).",
      );
    }

    const baseUrl = normalizeBaseUrl(cfg["baseUrl"]);
    const token = resolveGitLabToken(ctx, deps, "gitlab.mr.merge");

    ctx.deps.logger.info(
      `[gitlab.mr.merge] project=${project} mr=!${iid} base=${baseUrl}`,
    );

    const res = await gitlabRequest({
      baseUrl,
      token,
      method: "PUT",
      path: `/projects/${encodeProjectId(project)}/merge_requests/${encodeURIComponent(iid)}/merge`,
    });

    if (!res.ok) {
      throw new Error(
        `gitlab.mr.merge: HTTP ${res.status} merging MR !${iid}: ${res.text.slice(0, 300)}`,
      );
    }

    const merged = (res.json ?? {}) as Record<string, unknown>;
    ctx.deps.logger.info(
      `[gitlab.mr.merge] merged MR !${iid} state=${String(merged["state"] ?? "?")}`,
    );

    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Json",
      merged,
      {
        source: "gitlab.mr.merge",
        project,
        iid,
        state: String(merged["state"] ?? ""),
      },
    );
    return { kind: "produced", artifact };
  },
});
