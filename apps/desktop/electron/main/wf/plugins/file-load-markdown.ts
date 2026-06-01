/**
 * Runner du step kind "file.load-markdown".
 *
 * Lit le fichier Markdown indiqué par `step.config.path` (chemin absolu choisi
 * par l'utilisateur via le file picker côté UI) et l'expose comme un artifact
 * `Markdown`. Aucun `workspace.set` n'est requis en amont.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { PathPort } from "../application/ports/outbound/path";
import type { ArtifactPayload } from "../domain/artifact-schemas";

type FileLoadMarkdownConfig = {
  path: string;
};

const parseConfig = (
  cfg: Readonly<Record<string, unknown>>,
): FileLoadMarkdownConfig => {
  const raw = cfg["path"];
  const path = typeof raw === "string" ? raw.trim() : "";
  if (!path) {
    throw new Error("file.load-markdown: `path` is required");
  }
  return { path };
};

const assertAbsolute = (rawPath: string, pathPort: PathPort): string => {
  const resolved = pathPort.resolve(rawPath);
  if (resolved !== rawPath) {
    throw new Error(
      `file.load-markdown: \`path\` must be absolute (got "${rawPath}")`,
    );
  }
  return resolved;
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
    const cfg = parseConfig(ctx.step.config);
    const absolutePath = assertAbsolute(cfg.path, ctx.deps.path);

    const body = await ctx.deps.fs.readTextFile(absolutePath);
    if (body.length === 0) {
      throw new Error(
        `file.load-markdown: file is empty (${absolutePath})`,
      );
    }

    const payload: ArtifactPayload<"Markdown"> = {
      format: "markdown",
      body,
    };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        source: "file.load-markdown",
        path: absolutePath,
        byteLength: String(Buffer.byteLength(body, "utf-8")),
      },
    );
    return { kind: "produced", artifact };
  },
});
