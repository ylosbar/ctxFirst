/**
 * Runner du step kind `agent.judge` — la version **backend-agnostique** du juge
 * agentique `claude_code.judge`.
 *
 * Contrat de ports **inchangé** vs `claude_code.judge` : inputs `subject`
 * (primary) + `criteria` (optionnel, typiquement câblé depuis un `skill.loader`)
 * ; outputs `approved` / `rejected` / `exhausted` ; même JSON de verdict, même
 * `renderJudgeFeedback`, même auto-loop borné par `maxAttempts`. La seule
 * différence : le gateway LLM est **sélectionné** par `config.provider` (contre
 * un map injecté au câblage) au lieu d'être le gateway ambiant `ctx.deps.llm`.
 *
 * Les critères d'acceptation sont passés en **systemPrompt** : Claude Code les
 * honore via `--system-prompt` (persona système forte), l'adapter Codex les
 * préfixe au user prompt sur stdin (best-effort — friction documentée dans
 * l'UI). Voir `specs/agent-backend-agnostic-nodes.md`.
 *
 * Ce node figure dans `AUTO_LOOP_WHITELIST` (cf. `validate-template-ports.ts`) :
 * une transition `isLoop` sur `rejected` déclenche l'auto-loop.
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
import { asRunId } from "../domain/ids";
import {
  parseJudgeJson,
  renderJudgeFeedback,
  type JudgeOutput,
} from "../domain/judge-feedback";
import type { LLMGateway } from "../application/ports/outbound/llm-gateway";
import {
  DEFAULT_AGENT_PROVIDER,
  defaultModelFor,
  isKnownProvider,
  type AgentProvider,
} from "@shared/wf/agent-backends";
import type { AgentBackends } from "./agent-invoke";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_TOKENS = 8000;

type Deps = { backends: AgentBackends };

/**
 * Same JSON contract as `llm.judge` / `claude_code.judge` — kept in sync
 * intentionally so the `parseJudgeJson` / `renderJudgeFeedback` round-trip (and
 * therefore the orchestrator's `buildLoopHistory`) works identically.
 */
const JSON_OUTPUT_INSTRUCTIONS = [
  "Ta réponse DOIT être un seul objet JSON valide, sans texte autour, suivant ce schéma :",
  "",
  "```json",
  "{",
  '  "verdict": "approved" | "rejected",',
  '  "summary": "<1-3 phrases expliquant ta décision>",',
  '  "comments": [',
  '    { "anchor": { "startLine": <int>, "endLine": <int> }, "body": "<commentaire>" }',
  "  ]",
  "}",
  "```",
  "",
  "- `comments` est optionnel.",
  "- Numérote les lignes à partir de 1.",
  "- N'émets aucun texte avant ou après le JSON.",
].join("\n");

/**
 * Reads + validates `config.provider` against the static registry. Defaults to
 * {@link DEFAULT_AGENT_PROVIDER} when absent. Throws with the list of known
 * providers on an unknown value.
 */
const readProvider = (config: Readonly<Record<string, unknown>>): AgentProvider => {
  const p = config["provider"] ?? DEFAULT_AGENT_PROVIDER;
  if (!isKnownProvider(p)) {
    throw new Error(
      `agent.judge: unknown provider "${String(p)}". Available: claude-code, codex`,
    );
  }
  return p;
};

const readMaxAttempts = (config: Readonly<Record<string, unknown>>): number => {
  const raw = config["maxAttempts"];
  if (raw === undefined) return DEFAULT_MAX_ATTEMPTS;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new Error("agent.judge: `maxAttempts` must be a positive integer");
  }
  return raw;
};

const readApprovedKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const raw = config["approvedKind"];
  if (raw === undefined) return "Markdown";
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      "agent.judge: `approvedKind` must be a non-empty string when set",
    );
  }
  return raw as ArtifactKind;
};

/**
 * Resolves the acceptance criteria (the judge's system prompt): the wired
 * `criteria` input takes precedence over the inline `config.judgePrompt`. At
 * least one must be present and non-empty.
 */
const resolveCriteria = (ctx: RunContext): string => {
  const byPort = groupInputsByPort(ctx.inputs);
  const criteriaInput = byPort.get("criteria")?.[0];
  if (criteriaInput && criteriaInput.content.trim().length > 0) {
    return criteriaInput.content.trim();
  }
  const inline = ctx.step.config["judgePrompt"];
  if (typeof inline === "string" && inline.trim().length > 0) {
    return inline.trim();
  }
  throw new Error(
    "agent.judge: provide acceptance criteria via the `criteria` input (e.g. a skill.loader) or `config.judgePrompt`",
  );
};

const buildUserPrompt = (subjectContent: string): string =>
  [
    "## Sujet à juger",
    "",
    subjectContent,
    "",
    "## Format de sortie",
    "",
    JSON_OUTPUT_INSTRUCTIONS,
  ].join("\n");

const callJudge = async (
  ctx: RunContext,
  gateway: LLMGateway,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
): Promise<JudgeOutput> => {
  const stepExecId = ctx.stepExecId;
  let seq = 0;
  const res = await gateway.invokeStreaming({
    model,
    systemPrompt,
    userPrompt,
    maxTokens,
    cwd: ctx.workspace.cwd,
    onEvent: (payload) => {
      ctx.deps.llmSession.emit({
        stepExecId,
        seq: seq++,
        sessionId: undefined,
        payload,
      });
    },
  });

  const runId = asRunId(ctx.deps.ids.newId());
  await ctx.deps.runLog.record({
    id: runId,
    stepExecId: ctx.stepExecId,
    provider: res.provider,
    model,
    promptHash: ctx.deps.hash.sha256([systemPrompt, " ", userPrompt]),
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    cacheCreate: res.cacheCreate,
    cacheRead: res.cacheRead,
    costUsd: res.costUsd,
    latencyMs: res.latencyMs,
    outputRef: undefined,
    createdAt: ctx.deps.clock.now(),
  });

  return parseJudgeJson(res.output);
};

export const createAgentJudgeRunner = ({ backends }: Deps): StepRunner => ({
  kind: "agent.judge",

  resolveSpec({ config }): NodeSpec {
    const approvedKind = readApprovedKind(config);
    return {
      title: "Agent Judge",
      description:
        "Juge agentique (Claude Code, Codex, …) piloté par une Skill : évalue le subject, route vers approved/rejected/exhausted. Backend sélectionné par config.provider.",
      inputs: [
        { name: "subject", kinds: ["*"], primary: true },
        {
          name: "criteria",
          kinds: ["Markdown", "*"],
          optional: true,
        },
      ],
      outputs: [
        {
          name: "approved",
          kind: approvedKind,
          description: "Subject pass-through when the verdict is approved.",
        },
        {
          name: "rejected",
          kind: "Markdown",
          description:
            "Judge feedback when the verdict is rejected and attempts remain. An outgoing isLoop transition on this port triggers an auto-loop.",
        },
        {
          name: "exhausted",
          kind: "Markdown",
          description:
            "Same feedback as `rejected`, emitted when no attempts remain. Typically wired to a human gate.",
        },
      ],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const provider = readProvider(cfg);
    const gateway = backends[provider];
    if (!gateway) {
      throw new Error(
        `agent.judge: provider "${provider}" is not wired. Available: ${Object.keys(backends).join(", ")}`,
      );
    }
    const model = (cfg["model"] as string | undefined) ?? defaultModelFor(provider);
    const maxTokens = (cfg["maxTokens"] as number | undefined) ?? DEFAULT_MAX_TOKENS;
    const maxAttempts = readMaxAttempts(cfg);

    const byPort = groupInputsByPort(ctx.inputs);
    const subject = byPort.get("subject")?.[0] ?? ctx.inputs[0];
    if (!subject) {
      throw new Error("agent.judge: input port `subject` is required");
    }

    const systemPrompt = resolveCriteria(ctx);
    const userPrompt = buildUserPrompt(subject.content);

    const verdict = await callJudge(
      ctx,
      gateway,
      systemPrompt,
      userPrompt,
      model,
      maxTokens,
    );

    if (verdict.verdict === "approved") {
      // Pass-through the subject artifact unchanged on the `approved` port.
      const { meta } = await ctx.deps.artifactStore.get(subject.artifactId);
      return { kind: "produced-on-port", port: "approved", artifact: meta };
    }

    // verdict === "rejected" — materialize the feedback as Markdown at the
    // judge format so `buildLoopHistory` re-injects it unchanged, and pick the
    // port: `exhausted` on the last allowed attempt, `rejected` otherwise.
    // `attempt` is 0-indexed; `maxAttempts` is 1-indexed.
    const body = renderJudgeFeedback(verdict);
    const artifact = await putArtifactPayload(ctx.deps.artifactStore, "Markdown", {
      format: "markdown",
      body,
    });

    const isExhausted = ctx.attempt >= maxAttempts - 1;
    return {
      kind: "produced-on-port",
      port: isExhausted ? "exhausted" : "rejected",
      artifact,
    };
  },
});
