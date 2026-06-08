/**
 * Runner du step kind `llm.judge`.
 *
 * Lit l'artifact d'entrée (`subject`), demande à un LLM de le valider contre
 * une consigne, et route le résultat sur l'un de ses trois ports :
 *
 *  - `approved`  : le subject passe ; ré-émis tel-quel (pass-through).
 *  - `rejected`  : le subject est rejeté et il reste des tentatives — émet un
 *                  Markdown formatté avec le verdict et les commentaires.
 *  - `exhausted` : `ctx.attempt >= maxAttempts - 1` ET le verdict est rejeté ;
 *                  même contenu que `rejected`, port différent pour permettre
 *                  l'escalade humaine en aval.
 *
 * La logique de boucle (ré-invoquer le step amont sur `rejected`) est portée
 * par l'orchestrateur — voir `instance-orchestrator.ts` §afterValidated et
 * `specs/llm-judge-bounded-retries.md` §3. Le runner ignore tout des loops.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  RunContext,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactKind } from "../domain/artifact";
import { asRunId } from "../domain/ids";
import {
  parseJudgeJson,
  renderJudgeFeedback,
  type JudgeOutput,
} from "../domain/judge-feedback";

const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_MAX_ATTEMPTS = 3;

const readJudgePrompt = (config: Readonly<Record<string, unknown>>): string => {
  const raw = config["judgePrompt"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(
      "llm.judge requires `config.judgePrompt: string` (non-empty acceptance criteria)",
    );
  }
  return raw;
};

const readMaxAttempts = (config: Readonly<Record<string, unknown>>): number => {
  const raw = config["maxAttempts"];
  if (raw === undefined) return DEFAULT_MAX_ATTEMPTS;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new Error("llm.judge: `maxAttempts` must be a positive integer");
  }
  return raw;
};

const readApprovedKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind | undefined => {
  const raw = config["approvedKind"];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("llm.judge: `approvedKind` must be a non-empty string when set");
  }
  return raw as ArtifactKind;
};

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
  '- N\'émets aucun texte avant ou après le JSON.',
].join("\n");

const buildJudgePrompt = (judgePrompt: string, subject: string): string =>
  [
    judgePrompt.trim(),
    "",
    "## Sujet à juger",
    "",
    subject,
    "",
    "## Format de sortie",
    "",
    JSON_OUTPUT_INSTRUCTIONS,
  ].join("\n");

const callJudge = async (
  ctx: RunContext,
  judgePrompt: string,
  subjectContent: string,
  model: string,
): Promise<JudgeOutput> => {
  const userPrompt = buildJudgePrompt(judgePrompt, subjectContent);
  const stepExecId = ctx.stepExecId;
  let seq = 0;
  const res = await ctx.deps.llm.invokeStreaming({
    model,
    systemPrompt: "",
    userPrompt,
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
    promptHash: ctx.deps.hash.sha256(["", " ", userPrompt]),
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

export const createLlmJudgeRunner = (): StepRunner => ({
  kind: "llm.judge",

  resolveSpec({ config }): NodeSpec {
    const approvedKind = readApprovedKind(config) ?? "Markdown";
    return {
      title: "LLM Judge",
      description:
        "Évalue l'artifact d'entrée avec un LLM, route vers approved/rejected/exhausted.",
      inputs: [{ name: "subject", kinds: ["*"], primary: true }],
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
    const judgePrompt = readJudgePrompt(cfg);
    const model = (cfg["model"] as string | undefined) ?? DEFAULT_MODEL;
    const maxAttempts = readMaxAttempts(cfg);

    const subject = ctx.inputs[0];
    if (!subject) {
      throw new Error("llm.judge: input port `subject` is required");
    }

    const verdict = await callJudge(ctx, judgePrompt, subject.content, model);

    if (verdict.verdict === "approved") {
      // Pass-through the subject artifact unchanged on the `approved` port.
      const { meta } = await ctx.deps.artifactStore.get(subject.artifactId);
      return { kind: "produced-on-port", port: "approved", artifact: meta };
    }

    // verdict === "rejected" — materialize the feedback as Markdown and pick
    // the port: `exhausted` when this attempt is the last one allowed,
    // `rejected` otherwise. `attempt` is 0-indexed; `maxAttempts` is 1-indexed.
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
