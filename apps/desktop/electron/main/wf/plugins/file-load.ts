/**
 * Runner du step kind "file.load".
 *
 * Lit un fichier texte et l'expose comme artifact du kind choisi par
 * l'utilisateur (`config.outputKind`, polymorphe). Le chemin provient soit du
 * port d'entrée `path` (artifact `Path`/`String`/texte ou `*`), soit de
 * `config.path` — l'input l'emporte (même pattern que `webhook.call` pour
 * l'URL). Aucun `workspace.set` n'est requis en amont.
 *
 * Le contenu d'un fichier étant du texte, seuls les kinds **text-envelope**
 * (`{ format, body }`) ont un sens en sortie : `Markdown` et `Json`. Pour
 * `Json`, le body est parsé pour échouer tôt sur un JSON malformé.
 */
import { putArtifactPayload } from "../application/artifact-io";
import {
  groupInputsByPort,
  type NodeSpec,
  type RunContext,
  type StepOutcome,
  type StepRunner,
} from "../application/step-runner";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import type { Artifact } from "../domain/artifact";
import type { PathPort } from "../application/ports/outbound/path";

/**
 * Kinds text-envelope supportés en sortie, mappés vers la valeur `format`
 * attendue par leur schéma {@link TextEnvelope}. Ajouter ici un kind envelope
 * suffit à l'exposer au loader.
 */
export const FILE_LOAD_FORMATS = {
  Markdown: "markdown",
  Json: "json",
} as const;

export type FileLoadKind = keyof typeof FILE_LOAD_FORMATS;

export const isFileLoadKind = (kind: string): kind is FileLoadKind =>
  Object.prototype.hasOwnProperty.call(FILE_LOAD_FORMATS, kind);

const readStr = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

const assertAbsolute = (rawPath: string, pathPort: PathPort): string => {
  const resolved = pathPort.resolve(rawPath);
  if (resolved !== rawPath) {
    throw new Error(`file.load: \`path\` must be absolute (got "${rawPath}")`);
  }
  return resolved;
};

/**
 * Résout le chemin depuis l'input `path` (selon la forme du payload : `Path`
 * → `payload.path`, scalaire `String` → `payload.value`, envelope texte →
 * `payload.body`, sinon le `content` brut) avec repli sur `config.path`.
 */
const resolvePath = (ctx: RunContext): string => {
  const input = groupInputsByPort(ctx.inputs).get("path")?.[0];
  let fromInput: string | null = null;
  if (input) {
    const p = input.payload as Record<string, unknown> | null;
    if (p && typeof p === "object") {
      if (typeof p["path"] === "string") fromInput = p["path"];
      else if (typeof p["value"] === "string") fromInput = p["value"];
      else if (typeof p["body"] === "string") fromInput = p["body"];
    }
    fromInput = readStr(fromInput) ?? readStr(input.content);
  }
  const path = fromInput ?? readStr(ctx.step.config["path"]);
  if (!path) {
    throw new Error(
      "file.load: no path (wire the `path` input or set config.path).",
    );
  }
  return path;
};

/**
 * Cœur partagé **indépendant de la source** : valide un corps texte déjà lu
 * (vide → erreur, JSON parsé pour échouer tôt si `outputKind === "Json"`),
 * l'emballe dans son payload text-envelope et stocke l'artifact, qu'il
 * **retourne brut**. Le `meta` est passé tel quel à l'artifact store.
 *
 * Partagé entre {@link readFileToArtifact} (source = fichier local) et
 * `gitlab.files.fetch` (source = corps récupéré en HTTP) — même validation
 * JSON, même format de payload, peu importe d'où vient le texte.
 */
export const textToArtifact = async (
  ctx: RunContext,
  body: string,
  outputKind: FileLoadKind,
  source: string,
  meta: Record<string, string>,
): Promise<Artifact> => {
  if (body.length === 0) {
    throw new Error(`${source}: file is empty`);
  }

  if (outputKind === "Json") {
    try {
      JSON.parse(body);
    } catch {
      throw new Error(`${source}: file is not valid JSON`);
    }
  }

  const payload = {
    format: FILE_LOAD_FORMATS[outputKind],
    body,
  } as ArtifactPayload<FileLoadKind>;

  return putArtifactPayload(ctx.deps.artifactStore, outputKind, payload, meta);
};

/**
 * Cœur partagé bas niveau côté **fichier local** : lit le fichier au `kind`
 * demandé puis délègue la validation/stockage à {@link textToArtifact}.
 * Réutilisé par {@link loadFileArtifact} (forme `StepOutcome` mono-port) et par
 * `files.load`, qui route plusieurs artifacts vers leurs ports nommés et a donc
 * besoin de l'`Artifact` sans l'enveloppe `produced`.
 */
export const readFileToArtifact = async (
  ctx: RunContext,
  rawPath: string,
  outputKind: FileLoadKind,
  source: string,
): Promise<Artifact> => {
  const absolutePath = assertAbsolute(rawPath, ctx.deps.path);
  const body = await ctx.deps.fs.readTextFile(absolutePath);
  return textToArtifact(ctx, body, outputKind, source, {
    source,
    path: absolutePath,
    byteLength: String(Buffer.byteLength(body, "utf-8")),
  });
};

/**
 * Cœur partagé : lit le fichier au `kind` demandé et stocke l'artifact. Réutilisé
 * par le runner `file.load` et par l'alias deprecated `file.load-markdown`.
 */
export const loadFileArtifact = async (
  ctx: RunContext,
  rawPath: string,
  outputKind: FileLoadKind,
  source: string,
): Promise<StepOutcome> => {
  const artifact = await readFileToArtifact(ctx, rawPath, outputKind, source);
  return { kind: "produced", artifact };
};

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): FileLoadKind => {
  const k = readStr(config["outputKind"]);
  if (!k) {
    throw new Error(
      "file.load: config.outputKind is required (pick Markdown or Json).",
    );
  }
  if (!isFileLoadKind(k)) {
    throw new Error(
      `file.load: unsupported outputKind "${k}" (only Markdown and Json are supported).`,
    );
  }
  return k;
};

export const createFileLoadRunner = (): StepRunner => ({
  kind: "file.load",

  resolveSpec({ config }): NodeSpec {
    const outputKind = readStr(config["outputKind"]);
    return {
      title: "Load File",
      description:
        "Lit un fichier au chemin absolu (input `path` ou config) et l'expose comme artifact du kind choisi (Markdown ou Json).",
      // Optional `path` input — when wired it overrides config.path.
      inputs: [
        {
          name: "path",
          kinds: ["Path", "String", "Markdown", "*"],
          optional: true,
          primary: true,
        },
      ],
      // Until outputKind is chosen, no output port (permissive signature),
      // exactly like `webhook.call` / `transform.run`.
      outputs:
        outputKind && isFileLoadKind(outputKind)
          ? [{ name: "out", kind: outputKind, primary: true }]
          : [],
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const outputKind = readOutputKind(ctx.step.config);
    const rawPath = resolvePath(ctx);
    return loadFileArtifact(ctx, rawPath, outputKind, "file.load");
  },
});
