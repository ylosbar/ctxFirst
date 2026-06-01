/**
 * Runner du step kind "skill.loader".
 *
 * Résout une skill (alias "prompt" côté UI) sauvegardée dans la bibliothèque
 * via `config.skillRef`, et expose son `body` comme artifact Markdown sur le
 * port de sortie `out`. Permet de brancher un prompt persisté en amont d'un
 * `claude_code.invoke` qui consomme son port `in`.
 *
 * Découplé de `claude_code.invoke` : aucune dépendance config-level entre les deux.
 * La connexion se fait au niveau des transitions / variables.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import { asSkillRef } from "../domain/ids";

type SkillLoaderConfig = { skillRef: string };

const parseConfig = (
  cfg: Readonly<Record<string, unknown>>,
): SkillLoaderConfig => {
  const raw = cfg["skillRef"];
  const skillRef = typeof raw === "string" ? raw.trim() : "";
  if (!skillRef) {
    throw new Error("skill.loader: `skillRef` is required");
  }
  return { skillRef };
};

export const createSkillLoaderRunner = (): StepRunner => ({
  kind: "skill.loader",

  resolveSpec(): NodeSpec {
    return {
      title: "Skill Loader",
      description:
        "Charge une skill sauvegardée et expose son body comme artifact Markdown.",
      // Optional `*` input — available for chaining (e.g. behind a
      // `workspace.set` passthrough) but not consumed.
      inputs: [{ name: "in", kinds: ["*"], optional: true }],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const { skillRef } = parseConfig(ctx.step.config);
    if (!ctx.deps.skills) {
      throw new Error(
        "skill.loader: SkillRegistry not wired into ctx.deps.skills",
      );
    }
    const skill = await ctx.deps.skills.resolve(asSkillRef(skillRef));
    const payload: ArtifactPayload<"Markdown"> = {
      format: "markdown",
      body: skill.body,
    };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        source: "skill.loader",
        skillRef,
        byteLength: String(Buffer.byteLength(skill.body, "utf-8")),
      },
    );
    return { kind: "produced", artifact };
  },
});
