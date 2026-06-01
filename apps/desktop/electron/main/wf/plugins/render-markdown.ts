/**
 * Runner du step kind "render.markdown".
 *
 * Projette **n'importe quel** artifact typé (kind wildcard) en `Markdown`
 * human-friendly via la projection Markdown de son kind, résolue côté main par
 * {@link renderArtifactMarkdown} : fonction (built-in / plugin), gabarit
 * `{{champ}}` (kind `user`), champ `renderedMarkdown` embarqué, enveloppe texte
 * `body`, ou — dernier recours — un bloc JSON pretty-printé. Ne lève jamais.
 *
 * C'est le pont explicite et typé vers `concat.markdown` : sa sortie `Markdown`
 * satisfait `portAccepts` sans relâcher le contrat strict de `concat.markdown`
 * ni introduire de coercion implicite dans `portAccepts`. Cf.
 * `specs/typed-kind-rendered-markdown.md`.
 */
import { renderArtifactMarkdown } from "@shared/wf/render-artifact-markdown";
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";

/**
 * Best-effort parse of an input's raw content into a payload object, used when
 * the orchestrator runs in a degraded mode (`payload === null`). Returns the
 * raw string unchanged when it isn't JSON — `renderArtifactMarkdown` still has
 * a fallback for that.
 */
const payloadOf = (payload: unknown, content: string): unknown => {
  if (payload !== null && payload !== undefined) return payload;
  try {
    return JSON.parse(content);
  } catch {
    return { body: content };
  }
};

export const createRenderMarkdownRunner = (): StepRunner => ({
  kind: "render.markdown",

  resolveSpec(): NodeSpec {
    return {
      title: "Render Markdown",
      description:
        "Projette n'importe quel artifact typé en Markdown human-friendly via la " +
        "projection de son kind (fonction, gabarit, renderedMarkdown, ou JSON brut).",
      inputs: [{ name: "in", kinds: ["*"], primary: true }],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const input = ctx.inputs.find((i) => i.port === "in") ?? ctx.inputs[0];
    if (!input) {
      throw new Error("render.markdown: missing artifact on input port `in`");
    }

    // The registry is threaded through `ctx.deps` for core runners; a missing
    // descriptor (unknown kind) is fine — `renderArtifactMarkdown` degrades to
    // its generic chain.
    const descriptor = ctx.deps.artifactSchemas?.resolve(input.kind) ?? null;
    const body = renderArtifactMarkdown(
      descriptor?.markdownProjection ?? null,
      payloadOf(input.payload, input.content),
    );

    const payload: ArtifactPayload<"Markdown"> = { format: "markdown", body };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        source: "render.markdown",
        srcKind: input.kind,
        srcArtifactId: input.artifactId,
      },
    );
    return { kind: "produced", artifact };
  },
});
