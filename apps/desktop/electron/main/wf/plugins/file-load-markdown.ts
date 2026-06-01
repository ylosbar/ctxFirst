/**
 * Runner du step kind "file.load-markdown".
 *
 * @deprecated Alias conservé pour les templates persistés. Le node générique
 * {@link createFileLoadRunner} (`file.load`) couvre ce cas avec
 * `outputKind = "Markdown"` plus le choix du kind de sortie et un chemin
 * dynamique depuis un input. Ce runner reste enregistré pour ne pas casser les
 * templates existants ; il délègue son exécution au cœur partagé.
 *
 * Lit le fichier Markdown indiqué par `step.config.path` (chemin absolu choisi
 * par l'utilisateur via le file picker côté UI) et l'expose comme un artifact
 * `Markdown`.
 */
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import { loadFileArtifact } from "./file-load";

const readPath = (cfg: Readonly<Record<string, unknown>>): string => {
  const raw = cfg["path"];
  const path = typeof raw === "string" ? raw.trim() : "";
  if (!path) {
    throw new Error("file.load-markdown: `path` is required");
  }
  return path;
};

export const createFileLoadMarkdownRunner = (): StepRunner => ({
  kind: "file.load-markdown",

  resolveSpec(): NodeSpec {
    return {
      title: "Load Markdown File",
      description:
        "Lit un fichier Markdown au chemin absolu choisi par l'utilisateur et l'expose comme artifact Markdown.",
      // Optional `*` input — available for chaining but not consumed.
      inputs: [{ name: "in", kinds: ["*"], optional: true }],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const path = readPath(ctx.step.config);
    return loadFileArtifact(ctx, path, "Markdown", "file.load-markdown");
  },
});
