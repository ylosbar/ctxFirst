/**
 * Runner du step kind `agent.invoke` — « invoque un agent de code ».
 *
 * Version **backend-agnostique** de `claude_code.invoke` / `codex.invoke` : au
 * lieu de figer le moteur LLM dans l'identité du kind, le node lit un champ
 * `config.provider` (`claude-code` | `codex` | …) et sélectionne l'instance
 * `LLMGateway` correspondante dans un map injecté au câblage
 * (`composition-root.ts`). Tout le reste du pipeline est identique à
 * `claude-code-invoke.ts` — assemble le prompt, streame les events typés vers
 * le bus de session, stocke un artifact polymorphe (`config.outputKind`),
 * journalise une ligne de run-log, gère `humanGateRequired`.
 *
 * Le provider est validé en deux temps : `isKnownProvider` (registry statique
 * partagé) puis présence effective dans le map `backends` (câblage). Un provider
 * connu du registry mais non câblé échoue à l'exécution avec un message clair,
 * pas au boot. Voir `specs/agent-backend-agnostic-nodes.md`.
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
import {
  DEFAULT_AGENT_PROVIDER,
  defaultModelFor,
  isKnownProvider,
  type AgentProvider,
} from "@shared/wf/agent-backends";

/** Map provider → gateway, câblé au composition-root. */
export type AgentBackends = Readonly<Record<string, LLMGateway>>;

type Deps = { backends: AgentBackends };

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const k = config["outputKind"];
  if (typeof k !== "string") {
    throw new Error(
      "agent.invoke runner requires `config.outputKind` (which kind the agent produces)",
    );
  }
  return k as ArtifactKind;
};

/**
 * Reads + validates `config.provider` against the static registry. Defaults to
 * {@link DEFAULT_AGENT_PROVIDER} when absent (hand-authored node / un-normalised
 * import). Throws with the list of known providers on an unknown value.
 */
const readProvider = (config: Readonly<Record<string, unknown>>): AgentProvider => {
  const p = config["provider"] ?? DEFAULT_AGENT_PROVIDER;
  if (!isKnownProvider(p)) {
    throw new Error(
      `agent.invoke: unknown provider "${String(p)}". Available: claude-code, codex`,
    );
  }
  return p;
};

export const createAgentInvokeRunner = ({ backends }: Deps): StepRunner => ({
  kind: "agent.invoke",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readOutputKind(config);
    return {
      title: "Agent Invoke",
      description:
        "Invokes a coding agent (Claude Code, Codex, …) using the value of the `prompt` input as the prompt; backend selected by config.provider.",
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
    const provider = readProvider(cfg);
    const gateway = backends[provider];
    if (!gateway) {
      throw new Error(
        `agent.invoke: provider "${provider}" is not wired. Available: ${Object.keys(backends).join(", ")}`,
      );
    }
    const model = (cfg["model"] as string) ?? defaultModelFor(provider);
    const maxTokens = (cfg["maxTokens"] as number | undefined) ?? 8000;
    const outputKind = readOutputKind(cfg);

    if (ctx.inputs.length === 0) {
      throw new Error(
        "agent.invoke requires a value on its 'prompt' input port",
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

    const res = await gateway.invokeStreaming({
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
        // `res.provider` is the value the adapter reports (e.g. "codex-cli"),
        // which may differ in spelling from `config.provider` (the selector).
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
