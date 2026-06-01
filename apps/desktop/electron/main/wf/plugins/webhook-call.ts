/**
 * Step runner `webhook.call`. Emits a single HTTP request to an arbitrary REST
 * endpoint and stores the JSON response as a **typed** artifact whose kind is
 * picked by the user (`config.outputKind`, polymorphic).
 *
 * Pipeline:
 *  1. Resolve the target URL — dynamically from the `url` input (a text
 *     artifact: `payload.body` for a Markdown envelope, else `content`), with
 *     a fallback on `config.url`. Mirrors `linear.fetch`'s `resolveTicketRef`.
 *  2. (Optional) enforce `config.allowedHosts` before any network access.
 *  3. Build the request via {@link buildRequest} — the single seam where a
 *     future auth/secret resolver will inject an `Authorization` header
 *     (see spec §7); no other touch-point.
 *  4. `fetch` once (no streaming), read the body in full, fail on non-2xx when
 *     `config.failOnError !== false`.
 *  5. `JSON.parse` the body and write it through `putArtifactPayload`, which
 *     re-validates against the schema of `outputKind` — a non-conforming
 *     payload surfaces as `StepFailed(invalid-output)`, never a corrupt
 *     artifact.
 *
 * Runs in the Electron main process and uses the global `fetch` (same regime
 * as `openrouter.invoke` / the Linear adapter), so it bypasses the renderer
 * CSP — no CSP change is required.
 */
import { putArtifactPayload } from "../application/artifact-io";
import {
  groupInputsByPort,
  type NodeSpec,
  type RunContext,
  type StepOutcome,
  type StepRunner,
} from "../application/step-runner";
import type { ArtifactKind } from "../domain/artifact";

const readStr = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = readStr(config["outputKind"]);
  if (!k) {
    throw new Error(
      "webhook.call: config.outputKind is required (pick the response artifact type).",
    );
  }
  return k as ArtifactKind;
};

const readHeaders = (
  config: Readonly<Record<string, unknown>>,
): Record<string, string> => {
  const raw = config["headers"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
};

/**
 * Builds the `fetch` request from the step config and the resolved URL/body.
 * Isolated for testability **and** as the future auth seam: the day secrets
 * arrive (spec §7), the resolved `Authorization` header is injected here and
 * nowhere else.
 */
export const buildRequest = (
  config: Readonly<Record<string, unknown>>,
  urlStr: string,
  bodyStr: string | null,
): { url: string; init: RequestInit } => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...readHeaders(config),
  };
  const method = (readStr(config["method"]) ?? "GET").toUpperCase();
  const init: RequestInit = { method, headers };
  if (bodyStr !== null && method !== "GET" && method !== "HEAD") {
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    init.body = bodyStr;
  }
  return { url: urlStr, init };
};

export const createWebhookCallRunner = (): StepRunner => ({
  kind: "webhook.call",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readStr(config["outputKind"]);
    return {
      title: "Webhook: HTTP call",
      description:
        "Calls a REST endpoint (dynamic URL from input) and stores the JSON response as a typed artifact.",
      inputs: [
        { name: "url", kinds: ["Markdown", "*"], primary: true },
        { name: "body", kinds: ["*"], optional: true },
      ],
      // Until outputKind is chosen, no output port (permissive signature) —
      // the canvas and `validateTemplatePorts` stay happy, exactly like
      // `transform.run`.
      outputs: outputKind
        ? [{ name: "out", kind: outputKind as ArtifactKind, primary: true }]
        : [],
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const outputKind = readOutputKind(cfg);
    const byPort = groupInputsByPort(ctx.inputs);

    // Dynamic URL: input `url` (payload.body if it's a text envelope, else the
    // raw content), falling back to config.url.
    const urlInput = byPort.get("url")?.[0];
    const urlFromInput =
      urlInput?.payload &&
      typeof urlInput.payload === "object" &&
      "body" in urlInput.payload
        ? String(urlInput.payload.body).trim()
        : urlInput?.content.trim();
    const urlStr = urlFromInput || readStr(cfg["url"]);
    if (!urlStr) {
      throw new Error(
        "webhook.call: no URL (wire the `url` input or set config.url).",
      );
    }

    // (Optional, security) host allow-list — enforced before any fetch.
    const allowed = Array.isArray(cfg["allowedHosts"])
      ? (cfg["allowedHosts"] as unknown[]).filter(
          (h): h is string => typeof h === "string",
        )
      : [];
    if (allowed.length > 0) {
      const host = new URL(urlStr).hostname;
      if (!allowed.includes(host)) {
        throw new Error(
          `webhook.call: host "${host}" not in allowedHosts.`,
        );
      }
    }

    const bodyInput = byPort.get("body")?.[0];
    const bodyStr = bodyInput?.content ?? readStr(cfg["bodyTemplate"]);

    const { url, init } = buildRequest(cfg, urlStr, bodyStr ?? null);
    const started = Date.now();
    ctx.deps.logger.info(`[webhook.call] ${String(init.method)} ${url}`);

    const response = await fetch(url, init);
    const text = await response.text();

    ctx.deps.logger.info(
      `[webhook.call] ← ${response.status} ${url} ${text.slice(0, 500)}`,
    );

    if (cfg["failOnError"] !== false && !response.ok) {
      throw new Error(
        `webhook.call: HTTP ${response.status} on ${String(init.method)} ${url}: ${text.slice(0, 200)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `webhook.call: response is not valid JSON (status ${response.status}).`,
      );
    }

    // putArtifactPayload re-validates `parsed` against outputKind's schema →
    // StepFailed(invalid-output) on mismatch, no artifact written.
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      outputKind,
      parsed,
      {
        source: "webhook.call",
        url,
        method: String(init.method),
        statusCode: String(response.status),
        latencyMs: String(Date.now() - started),
      },
    );

    return { kind: "produced", artifact };
  },
});
