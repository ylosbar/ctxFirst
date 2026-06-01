/**
 * Step runner `gitlab.pipeline.wait`. Polls a GitLab CI pipeline of an
 * arbitrary project until it reaches a terminal status, then routes the run
 * onto the `success` or `failure` output port (à la `shell.exec`) and stores
 * the final pipeline JSON as a `Json` artifact.
 *
 * Pipeline:
 *  1. Resolve project id + pipeline id — dynamically from the `pipeline` input
 *     (a JSON/text envelope carrying `{ project, id }`), with a fallback on
 *     `config.project` / `config.pipelineId`.
 *  2. Loop: GET /projects/:project/pipelines/:id every `pollMs` until the
 *     status leaves the active set, or `timeoutMs` elapses (→ StepFailed).
 *  3. Emit the final pipeline object on `success` (status === "success") or
 *     `failure` (any other terminal status).
 *
 * Runs in the Electron main process and uses the global `fetch`, so it bypasses
 * the renderer CSP — no CSP change required (same regime as `webhook.call`).
 */
import { putArtifactPayload } from "../application/artifact-io";
import {
  groupInputsByPort,
  type NodeSpec,
  type RunContext,
  type StepOutcome,
  type StepRunner,
} from "../application/step-runner";

const TERMINAL = new Set(["success", "failed", "canceled", "skipped", "manual"]);

const readStr = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const readNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Resolve `{ project, id }` from the wired input, falling back to config. */
const resolveTarget = (
  ctx: RunContext,
): { project: string; pipelineId: string } => {
  const cfg = ctx.step.config;
  const byPort = groupInputsByPort(ctx.inputs);
  const input = byPort.get("pipeline")?.[0];
  const payload =
    input?.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : null;

  const project =
    readStr(payload?.["project"]) ??
    readStr(cfg["project"]) ??
    // numeric project id is also valid
    (readNum(payload?.["project"]) ?? readNum(cfg["project"]))?.toString() ??
    null;
  const pipelineId =
    readStr(payload?.["id"]) ??
    readStr(cfg["pipelineId"]) ??
    (readNum(payload?.["id"]) ?? readNum(cfg["pipelineId"]))?.toString() ??
    null;

  if (!project || !pipelineId) {
    throw new Error(
      "gitlab.pipeline.wait: missing project/pipeline id (wire the `pipeline` input or set config.project + config.pipelineId).",
    );
  }
  return { project, pipelineId };
};

export const createGitlabPipelineWaitRunner = (): StepRunner => ({
  kind: "gitlab.pipeline.wait",

  resolveSpec(): NodeSpec {
    return {
      title: "GitLab: wait for pipeline",
      description:
        "Polls a GitLab CI pipeline of another project until it finishes, then branches on success/failure.",
      inputs: [{ name: "pipeline", kinds: ["Json", "*"], primary: true }],
      outputs: [
        { name: "success", kind: "Json", primary: true },
        { name: "failure", kind: "Json" },
      ],
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const { project, pipelineId } = resolveTarget(ctx);

    const baseUrl =
      readStr(cfg["baseUrl"]) ?? "https://gitlab.com";
    const pollMs = readNum(cfg["pollMs"]) ?? 10_000;
    const timeoutMs = readNum(cfg["timeoutMs"]) ?? 30 * 60_000; // 30 min

    // Token via the environment port — never process.env directly.
    const tokenKey = readStr(cfg["tokenEnv"]) ?? "GITLAB_TOKEN";
    const token = ctx.deps.environment.read([tokenKey])[tokenKey];
    if (!token) {
      throw new Error(
        `gitlab.pipeline.wait: env var "${tokenKey}" is not set (GitLab access token).`,
      );
    }

    const url = `${baseUrl}/api/v4/projects/${encodeURIComponent(
      project,
    )}/pipelines/${encodeURIComponent(pipelineId)}`;
    const headers = { "PRIVATE-TOKEN": token, Accept: "application/json" };

    const deadline = ctx.deps.clock.now() + timeoutMs;
    let last: Record<string, unknown> | null = null;

    for (;;) {
      const res = await fetch(url, { headers });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `gitlab.pipeline.wait: HTTP ${res.status} on ${url}: ${text.slice(0, 200)}`,
        );
      }
      last = JSON.parse(text) as Record<string, unknown>;
      const status = String(last["status"] ?? "");
      ctx.deps.logger.info(
        `[gitlab.pipeline.wait] project=${project} pipeline=${pipelineId} status=${status}`,
      );

      if (TERMINAL.has(status)) {
        const port = status === "success" ? "success" : "failure";
        const artifact = await putArtifactPayload(
          ctx.deps.artifactStore,
          "Json",
          { format: "json", body: JSON.stringify(last) },
          { source: "gitlab.pipeline.wait", project, pipelineId, status },
        );
        return { kind: "produced-on-port", port, artifact };
      }

      if (ctx.deps.clock.now() >= deadline) {
        throw new Error(
          `gitlab.pipeline.wait: timed out after ${timeoutMs}ms (last status: ${status}).`,
        );
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  },
});
