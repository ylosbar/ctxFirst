/**
 * Runner du step kind "codex.invoke".
 *
 * Strict mirror de `claude_code.invoke` ([./claude-code-invoke.ts]), seul le
 * backend change : on invoque le CLI Codex (OpenAI) au lieu de Claude. Même
 * séquence — assemble le prompt, appelle le LLM en streaming (events typés →
 * bus de session), stocke un artifact polymorphe, journalise une ligne de
 * run-log, gère `humanGateRequired`.
 *
 * **Différence clé** : le gateway est reçu par la factory
 * (`createCodexInvokeRunner({ codex })`), pas via `ctx.deps.llm` — même pattern
 * qu'`openrouter.invoke`. `RunContext.deps` reste donc inchangé.
 */
import { assemble } from "../application/services/context-assembler";
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactKind } from "../domain/artifact";
import { serializeFromString } from "../domain/artifact-serializer";
import { asRunId } from "../domain/ids";
import type { LLMGateway } from "../application/ports/outbound/llm-gateway";

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = config["outputKind"];
  if (typeof k !== "string") {
    throw new Error(
      "codex.invoke runner requires `config.outputKind` (which kind the LLM produces)",
    );
  }
  return k as ArtifactKind;
};

type Deps = { codex: LLMGateway };

export const createCodexInvokeRunner = ({ codex }: Deps): StepRunner => ({
  kind: "codex.invoke",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readOutputKind(config);
    return {
      title: "Codex Invoke",
      description:
        "Invokes the Codex CLI (OpenAI) using the value of the `prompt` input as the prompt.",
      // Polymorphic port: most LLM steps consume Markdown-shaped text, but an
      // upstream `user.input` may emit a `plugin:linear:Ticket@v1` etc. The
      // runner sends `inputs[0].content` as the user prompt, so we accept any
      // kind in v1.
      inputs: [{ name: "prompt", kinds: ["*"] }],
      outputs: [{ kind: outputKind, name: "out" }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const model = (cfg["model"] as string) ?? "gpt-5-codex";
    const maxTokens = (cfg["maxTokens"] as number | undefined) ?? 8000;
    const outputKind = readOutputKind(cfg);

    if (ctx.inputs.length === 0) {
      throw new Error(
        "codex.invoke requires a value on its 'prompt' input port",
      );
    }

    // Inputs are consumed raw. Templates that need a simplified payload now
    // insert an explicit `transform.run` step upstream.
    const assembled = assemble(
      {
        prompt: ctx.inputs[0]?.content ?? "",
        loopHistory: [...ctx.loopHistory],
      },
      ctx.deps.hash,
    );

    const stepExecId = ctx.stepExecId;
    let seq = 0;
    let sessionIdSeen: string | undefined;

    const res = await codex.invokeStreaming({
      model,
      systemPrompt: assembled.systemPrompt,
      userPrompt: assembled.userPrompt,
      maxTokens,
      cwd: ctx.workspace.cwd,
      onEvent: (payload) => {
        ctx.deps.llmSession.emit({
          stepExecId,
          seq: seq++,
          sessionId: sessionIdSeen,
          payload,
        });
      },
    });

    if (res.sessionId) sessionIdSeen = res.sessionId;

    const payload = serializeFromString(outputKind, res.output);
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      outputKind,
      payload,
      {
        model,
        provider: res.provider,
        tokensIn: String(res.tokensIn),
        tokensOut: String(res.tokensOut),
        ...(res.cacheCreate !== undefined
          ? { cacheCreate: String(res.cacheCreate) }
          : {}),
        ...(res.cacheRead !== undefined
          ? { cacheRead: String(res.cacheRead) }
          : {}),
        latencyMs: String(res.latencyMs),
        ...(res.costUsd !== undefined ? { costUsd: String(res.costUsd) } : {}),
      },
    );

    const runId = asRunId(ctx.deps.ids.newId());
    await ctx.deps.runLog.record({
      id: runId,
      stepExecId: ctx.stepExecId,
      provider: res.provider,
      model,
      promptHash: assembled.hash,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      cacheCreate: res.cacheCreate,
      cacheRead: res.cacheRead,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
      outputRef: artifact.id,
      createdAt: ctx.deps.clock.now(),
    });

    if (ctx.step.humanGateRequired) {
      const actorRole =
        (cfg["actorRole"] as string | undefined) ??
        ctx.step.actorRole ??
        "Developer";
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
