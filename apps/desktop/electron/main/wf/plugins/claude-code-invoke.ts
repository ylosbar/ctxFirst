/**
 * Runner du step kind "claude_code.invoke".
 *
 * ─── Qu'est-ce qu'un runner ? ────────────────────────────────────────────────
 * Un workflow est une suite de "steps". Chaque step a un `kind` (ex.
 * "claude_code.invoke", "human.gate", "user.input"). L'orchestrateur ne sait pas
 * exécuter un step lui-même : il délègue à un *runner* enregistré pour ce kind
 * dans le `StepRunnerRegistry` (cf. application/step-runner.ts).
 *
 * Un runner est donc une *stratégie* qui sait :
 *   1. lire la config + les inputs du step,
 *   2. produire un artefact (ou demander une intervention humaine),
 *   3. journaliser ce qu'il a fait.
 *
 * Tout est injecté via `ctx.deps` (ports outbound de l'archi hexagonale),
 * jamais importé en dur. Conséquence : le runner est testable sans réseau,
 * sans LLM réel, sans horloge réelle.
 *
 * ─── Cycle de vie d'un appel ─────────────────────────────────────────────────
 *   orchestrator
 *     └─ resolve("claude_code.invoke") → ce runner
 *         └─ run(ctx)
 *             ├─ assemble le prompt (skill + inputs + historique)
 *             ├─ appelle le LLM en streaming (events typés → bus de session)
 *             ├─ stocke la sortie dans l'artifact store
 *             ├─ enregistre une ligne de run-log (provider, tokens, coût…)
 *             └─ retourne { kind: "produced" | "produced-pending-human", ... }
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

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = config["outputKind"];
  if (typeof k !== "string") {
    throw new Error(
      "claude_code.invoke runner requires `config.outputKind` (which kind the LLM produces)",
    );
  }
  return k as ArtifactKind;
};

export const createClaudeCodeInvokeRunner = (): StepRunner => ({
  kind: "claude_code.invoke",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readOutputKind(config);
    return {
      title: "Claude Code Invoke",
      description: "Invokes a model using the value of the `prompt` input as the prompt.",
      // Polymorphic port: most LLM steps consume Markdown-shaped text, but
      // an upstream `user.input` may emit a `plugin:linear:Ticket@v1` etc. The runner
      // sends `inputs[0].content` as the user prompt, so we accept any kind
      // in v1.
      inputs: [{ name: "prompt", kinds: ["*"] }],
      outputs: [{ kind: outputKind, name: "out" }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const model = (cfg["model"] as string) ?? "claude-opus-4-7";
    const maxTokens = (cfg["maxTokens"] as number | undefined) ?? 8000;
    const outputKind = readOutputKind(cfg);

    if (ctx.inputs.length === 0) {
      throw new Error(
        "claude_code.invoke requires a value on its 'prompt' input port",
      );
    }

    // Inputs are consumed raw. Templates that need a simplified payload now
    // insert an explicit `transform.run` step upstream (cf.
    // `specs/artifact-typing-overhaul.md` §Pilier B).
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

    const res = await ctx.deps.llm.invokeStreaming({
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
        (cfg["actorRole"] as string | undefined) ?? ctx.step.actorRole ?? "Developer";
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
