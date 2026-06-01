/**
 * Step runner `openrouter.invoke`. Ported from the OpenRouter built-in plugin
 * to the engine core. The kind stays identical, so templates that reference
 * it keep running without any migration.
 *
 * Pipeline:
 *  1. Read `config.outputKind` (must be one of the text-envelope kinds).
 *  2. Resolve the configured Skill (its body is concatenated as system context).
 *  3. Concatenate skill body + the first input's content as the user message.
 *  4. Call OpenRouter (single-shot, no streaming).
 *  5. Store the response as a typed artifact (`format: "markdown", body: <text>`).
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactKind } from "../domain/artifact";
import { asRunId, asSkillRef } from "../domain/ids";
import type { OpenRouterClient } from "../adapters/llm/openrouter";

const TEXT_ENVELOPE_KINDS: ReadonlySet<ArtifactKind> = new Set([
  "Markdown",
] as readonly ArtifactKind[]);

export const OPENROUTER_DEFAULT_OUTPUT_KIND: ArtifactKind = "Markdown";
export const OPENROUTER_TEXT_ENVELOPE_KINDS = TEXT_ENVELOPE_KINDS;

const DEFAULT_MAX_TOKENS = 4000;

const readString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = readString(config["outputKind"]) ?? OPENROUTER_DEFAULT_OUTPUT_KIND;
  if (!TEXT_ENVELOPE_KINDS.has(k as ArtifactKind)) {
    throw new Error(
      `openrouter.invoke: outputKind "${k}" is not supported. Use one of: ${[...TEXT_ENVELOPE_KINDS].join(", ")}.`,
    );
  }
  return k as ArtifactKind;
};

const buildUserMessage = (skillBody: string, promptContent: string): string => {
  const parts: string[] = [];
  if (skillBody && skillBody.trim().length > 0) parts.push(skillBody.trim());
  if (promptContent && promptContent.length > 0) parts.push(promptContent);
  return parts.join("\n\n");
};

type Deps = {
  openrouter: OpenRouterClient;
  /** Resolves the user-configured default model. */
  getDefaultModel: () => Promise<string>;
};

export const createOpenRouterInvokeRunner = ({
  openrouter,
  getDefaultModel,
}: Deps): StepRunner => ({
  kind: "openrouter.invoke",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readOutputKind(config);
    return {
      title: "OpenRouter: Invoke",
      description:
        "Calls an OpenRouter chat-completion model with a Skill as system context concatenated to the prompt input.",
      inputs: [{ name: "prompt", kinds: ["*"] }],
      outputs: [
        {
          name: "out",
          kind: outputKind,
          description: "Model response, stored as the chosen artifact kind.",
          primary: true,
        },
      ],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const outputKind = readOutputKind(cfg);

    // `skillRef` is optional: the Skill body usually arrives via the `prompt`
    // input (e.g. an upstream `skill.loader` → `concat.markdown` chain). When a
    // ref is configured, its body is prepended as system context on top.
    const skillRefRaw = readString(cfg["skillRef"]);

    const model = readString(cfg["model"]) ?? (await getDefaultModel());
    const maxTokens =
      typeof cfg["maxTokens"] === "number" && cfg["maxTokens"] > 0
        ? (cfg["maxTokens"])
        : DEFAULT_MAX_TOKENS;

    let skillBody = "";
    let skillRefUsed = "";
    if (skillRefRaw) {
      if (!ctx.deps.skills) {
        throw new Error("openrouter.invoke: skills registry not available");
      }
      const skill = await ctx.deps.skills.resolve(asSkillRef(skillRefRaw));
      skillBody = skill.body;
      skillRefUsed = String(skill.ref);
    }

    // First input as prompt; multiple incoming `*` inputs are concatenated.
    const promptContent = ctx.inputs
      .map((i) => (typeof i.content === "string" ? i.content : ""))
      .filter((s) => s.length > 0)
      .join("\n\n");

    if (promptContent.length === 0 && skillBody.trim().length === 0) {
      throw new Error(
        "openrouter.invoke: both the Skill body and the prompt input are empty — nothing to send.",
      );
    }

    const userMessage = buildUserMessage(skillBody, promptContent);
    const promptHash = ctx.deps.hash.sha256([model, userMessage]);

    ctx.deps.logger.info(
      `[openrouter.invoke] model=${model} skill=${skillRefUsed || "(none)"} promptLen=${promptContent.length}`,
    );

    const res = await openrouter.complete({
      model,
      messages: [{ role: "user", content: userMessage }],
      maxTokens,
    });

    const text = res.content;
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("openrouter.invoke: model returned an empty response.");
    }

    const payload = { format: "markdown" as const, body: text };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      outputKind,
      payload,
      {
        source: "openrouter.invoke",
        skillRef: skillRefUsed,
        model,
        modelUsed: res.modelUsed,
        provider: res.provider,
        tokensIn: String(res.tokensIn),
        tokensOut: String(res.tokensOut),
        latencyMs: String(res.latencyMs),
      },
    );

    const runId = asRunId(ctx.deps.ids.newId());
    await ctx.deps.runLog.record({
      id: runId,
      stepExecId: ctx.stepExecId,
      provider: res.provider,
      model,
      promptHash,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      latencyMs: res.latencyMs,
      outputRef: artifact.id,
      createdAt: ctx.deps.clock.now(),
    });

    if (ctx.step.humanGateRequired) {
      const actorRole =
        readString(cfg["actorRole"]) ?? ctx.step.actorRole ?? "Developer";
      return {
        kind: "produced-pending-human",
        artifact,
        runs: [runId],
        actorRole,
      };
    }
    return { kind: "produced", artifact, runs: [runId] };
  },
});
