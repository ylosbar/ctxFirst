/**
 * Runner du step kind `format.validate`.
 *
 * Variante **déterministe** de `llm.judge` : au lieu d'interroger un LLM, il
 * valide l'artifact d'entrée (`subject`) contre le schéma d'un artifact kind
 * enregistré (`config.expectedKind`) via `ArtifactSchemaRegistry.validate`, et
 * route sur les trois mêmes ports :
 *
 *  - `approved`  : le format est valide ; le subject est ré-émis tel-quel.
 *  - `rejected`  : le format est invalide et il reste des tentatives — émet un
 *                  Markdown au format `renderJudgeFeedback` (résumé + un
 *                  commentaire par `ZodIssue`).
 *  - `exhausted` : `ctx.attempt >= maxAttempts - 1` ET invalide ; même contenu
 *                  que `rejected`, port différent pour l'escalade humaine.
 *
 * Le feedback est rendu via `renderJudgeFeedback` (et non un format maison) à
 * dessein : l'auto-loop de l'orchestrateur ré-extrait le feedback via
 * `parseJudgeFeedback`, qui attend exactement ce rendu. En se conformant à ce
 * contrat + en figurant dans `AUTO_LOOP_WHITELIST`, ce node se branche comme
 * `llm.judge` sans toucher une ligne de l'orchestrateur — l'auto-loop le tague
 * `llm.judge:<stepId>` (cf. `judge-feedback.ts`), ce qui est voulu malgré le
 * nom trompeur. Voir `specs/format-validate-node.md`.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  RunContext,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactKind } from "../domain/artifact";
import {
  type ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../domain/artifact-errors";
import type { ReviewComment } from "../domain/feedback";
import { renderJudgeFeedback } from "../domain/judge-feedback";

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Strips a leading Markdown code fence (```` ``` ````) around the payload, so a
 * JSON answer the LLM wrapped in a ```json block validates against the target
 * schema. Returns the inner block when fenced, the input unchanged otherwise.
 * Mirrors `json.transform`'s helper.
 */
const FENCE_RE = /`{3,}[^\n]*\n([\s\S]*?)\n`{3,}/;
const stripCodeFence = (raw: string): string => {
  const m = FENCE_RE.exec(raw);
  return m ? m[1] : raw;
};

/**
 * Extracts the raw string to validate from the `subject` input.
 *
 * When the subject is an envelope kind (`Markdown`, `Json`, `Text`…), its
 * meaningful content lives in `payload.body` — for an LLM node that's the model
 * output itself, which is what we want to match against `expectedKind`. For
 * structured kinds (`user:*`, `plugin:*`) `content` is already the serialized
 * payload, so we validate that directly. Same dispatch as `json.transform`.
 */
const readSubjectRaw = (subject: {
  payload: unknown;
  content: string;
}): string => {
  const payload = subject.payload as { body?: unknown } | null;
  const raw =
    payload && typeof payload.body === "string" ? payload.body : subject.content;
  return stripCodeFence(raw);
};

type FormatValidateConfig = {
  expectedKind: ArtifactKind;
  maxAttempts?: number;
  approvedKind?: ArtifactKind;
};

const readExpectedKind = (
  config: Readonly<Record<string, unknown>>,
): ArtifactKind => {
  const raw = config["expectedKind"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(
      "format.validate requires `config.expectedKind: string` (a registered artifact kind)",
    );
  }
  return raw as ArtifactKind;
};

const readMaxAttempts = (config: Readonly<Record<string, unknown>>): number => {
  const raw = config["maxAttempts"];
  if (raw === undefined) return DEFAULT_MAX_ATTEMPTS;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new Error(
      "format.validate: `maxAttempts` must be a positive integer",
    );
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
      "format.validate: `approvedKind` must be a non-empty string when set",
    );
  }
  return raw as ArtifactKind;
};

/**
 * Maps the Zod issues of an {@link ArtifactSchemaError} to review comments.
 * Artifacts have no notion of a line, so each comment gets a synthetic anchor
 * on line 1 and a body of `"<path>: <message>"` (path joined by `.`, or
 * `<root>` for the top level — mirrors `ArtifactSchemaError`'s own message).
 */
const toComments = (error: ArtifactSchemaError): ReviewComment[] =>
  error.issues.map((issue) => ({
    anchor: { startLine: 1, endLine: 1 },
    body: `${issue.path.join(".") || "<root>"}: ${issue.message}`,
  }));

export const createFormatValidateRunner = (): StepRunner => ({
  kind: "format.validate",

  resolveSpec({ config }): NodeSpec {
    const approvedKind = readApprovedKind(config);
    return {
      title: "Format Validate",
      description:
        "Valide l'artifact d'entrée contre le schéma d'un artifact kind, route vers approved/rejected/exhausted.",
      inputs: [{ name: "subject", kinds: ["*"], primary: true }],
      outputs: [
        {
          name: "approved",
          kind: approvedKind,
          description: "Subject pass-through quand le format est valide.",
        },
        {
          name: "rejected",
          kind: "Markdown",
          description:
            "Feedback de validation quand invalide et tentatives restantes. Une transition isLoop sur ce port déclenche l'auto-loop.",
        },
        {
          name: "exhausted",
          kind: "Markdown",
          description:
            "Même feedback, émis quand plus de tentatives. Typiquement câblé vers un human gate.",
        },
      ],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const expectedKind = readExpectedKind(ctx.step.config);
    const maxAttempts = readMaxAttempts(ctx.step.config);

    if (!ctx.deps.artifactSchemas) {
      throw new Error(
        "format.validate: artifact-schema registry not available on ctx.deps",
      );
    }
    const subject = ctx.inputs[0];
    if (!subject) {
      throw new Error("format.validate: input port `subject` is required");
    }

    const result = ctx.deps.artifactSchemas.validate(
      expectedKind,
      readSubjectRaw(subject),
    );

    if (result.ok) {
      // Pass-through the subject artifact unchanged on the `approved` port.
      const { meta } = await ctx.deps.artifactStore.get(subject.artifactId);
      return { kind: "produced-on-port", port: "approved", artifact: meta };
    }

    // An unknown `expectedKind` is a configuration error, not a business
    // rejection — surface it as `StepFailed` rather than looping forever.
    if (result.error instanceof UnknownArtifactKindError) {
      throw result.error;
    }

    // Invalid → materialize the feedback at the judge format so the
    // orchestrator's `buildLoopHistory` re-injects it unchanged.
    const body = renderJudgeFeedback({
      verdict: "rejected",
      summary: result.error.message,
      comments: toComments(result.error),
    });
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      {
        format: "markdown",
        body,
      },
    );

    // `attempt` is 0-indexed; `maxAttempts` is 1-indexed.
    const isExhausted = ctx.attempt >= maxAttempts - 1;
    return {
      kind: "produced-on-port",
      port: isExhausted ? "exhausted" : "rejected",
      artifact,
    };
  },
});
