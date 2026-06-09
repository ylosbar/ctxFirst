/**
 * Runner du step kind `claude_code.judge`.
 *
 * Variante **agentique** de `llm.judge` : même contrat de sortie (ports
 * `approved` / `rejected` / `exhausted`, même format de feedback via
 * `renderJudgeFeedback`, même auto-loop borné par `maxAttempts`), mais le juge
 * est piloté par une **Skill** plutôt que par un `judgePrompt` inline.
 *
 *  - La consigne d'acceptation (la spec) est fournie soit par l'input optionnel
 *    `criteria` — typiquement câblé depuis un `skill.loader` / `concat.markdown` —
 *    soit, à défaut, par `config.judgePrompt`. Elle est passée comme **system
 *    prompt** du CLI Claude Code (cf. `--system-prompt`), si bien que le juge
 *    tourne comme un vrai agent (tools + workspace `cwd`) avec la persona de la
 *    skill, au lieu d'un appel LLM brut.
 *  - Le `subject` à juger est passé dans le user prompt, suivi des instructions
 *    de format JSON. La réponse est parsée par `parseJudgeJson`.
 *
 * Routage identique à `llm.judge` :
 *  - `approved`  : le subject passe ; ré-émis tel-quel (pass-through).
 *  - `rejected`  : rejeté avec des tentatives restantes — Markdown au format
 *                  `renderJudgeFeedback` (ré-extrait par `buildLoopHistory`).
 *  - `exhausted` : `ctx.attempt >= maxAttempts - 1` ET rejeté — même contenu,
 *                  port différent pour l'escalade humaine.
 *
 * La logique de boucle (ré-invoquer le step amont sur `rejected` via une
 * transition `isLoop`) est portée par l'orchestrateur. Ce node figure dans
 * `AUTO_LOOP_WHITELIST` (cf. `validate-template-ports.ts`) ; l'auto-loop le
 * tague `llm.judge:<stepId>` (cf. `judge-feedback.ts`), comme `format.validate`.
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

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_TOKENS = 8000;

/**
 * Same JSON contract as `llm.judge` — kept in sync intentionally so the
 * `parseJudgeJson` / `renderJudgeFeedback` round-trip (and therefore the
 * orchestrator's `buildLoopHistory`) works identically for both judges.
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

const readMaxAttempts = (config: Readonly<Record<string, unknown>>): number => {
  const raw = config["maxAttempts"];
  if (raw === undefined) return DEFAULT_MAX_ATTEMPTS;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new Error("claude_code.judge: `maxAttempts` must be a positive integer");
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
      "claude_code.judge: `approvedKind` must be a non-empty string when set",
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
    "claude_code.judge: provide acceptance criteria via the `criteria` input (e.g. a skill.loader) or `config.judgePrompt`",
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
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
): Promise<JudgeOutput> => {
  const stepExecId = ctx.stepExecId;
  let seq = 0;
  const res = await ctx.deps.llm.invokeStreaming({
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

export const createClaudeCodeJudgeRunner = (): StepRunner => ({
  kind: "claude_code.judge",

  resolveSpec({ config }): NodeSpec {
    const approvedKind = readApprovedKind(config);
    return {
      title: "Claude Code Judge",
      description:
        "Juge agentique (CLI Claude Code) piloté par une Skill : évalue le subject, route vers approved/rejected/exhausted.",
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
    const model = (cfg["model"] as string | undefined) ?? DEFAULT_MODEL;
    const maxTokens = (cfg["maxTokens"] as number | undefined) ?? DEFAULT_MAX_TOKENS;
    const maxAttempts = readMaxAttempts(cfg);

    const byPort = groupInputsByPort(ctx.inputs);
    const subject = byPort.get("subject")?.[0] ?? ctx.inputs[0];
    if (!subject) {
      throw new Error("claude_code.judge: input port `subject` is required");
    }

    const systemPrompt = resolveCriteria(ctx);
    const userPrompt = buildUserPrompt(subject.content);

    const verdict = await callJudge(
      ctx,
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
