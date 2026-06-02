/**
 * Runner du step kind "files.load".
 *
 * Pendant « multi » de `file.load` : prend **un répertoire de base** (input
 * `path` ou `config.path` — l'input l'emporte) et laisse l'utilisateur déclarer
 * **N slots** `{ port, subpath, outputKind }`. Chaque slot lit le fichier situé
 * à `path.resolve(base, subpath)` (sous contrainte de containment : pas
 * d'évasion hors de la base) et l'expose sur **son port de sortie nommé**.
 * Émet un outcome `produced-many` couvrant tous les ports déclarés.
 *
 * Réutilise tel quel le cœur de lecture/validation/stockage de `file.load`
 * ({@link readFileToArtifact}) — mêmes kinds text-envelope (`Markdown` | `Json`),
 * même garde de chemin absolu, même validation JSON early-fail.
 */
import {
  readFileToArtifact,
  isFileLoadKind,
  type FileLoadKind,
} from "./file-load";
import {
  groupInputsByPort,
  type NodeSpec,
  type ProducedSlot,
  type RunContext,
  type StepOutcome,
  type StepRunner,
} from "../application/step-runner";

const PORT_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

type Slot = { port: string; subpath: string; outputKind: FileLoadKind };

const readStr = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/**
 * Parse + valide `config.slots` ; throw avec un message explicite par règle
 * (cf. tableau de validation de la spec). Le subpath doit être non vide ici ;
 * la contrainte de containment (reste sous la base) est vérifiée au run, une
 * fois la base résolue.
 */
const readSlots = (
  config: Readonly<Record<string, unknown>>,
): ReadonlyArray<Slot> => {
  const raw = config["slots"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("files.load requires config.slots[] (≥ 1)");
  }
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new Error("files.load: each slot must be an object");
    }
    const { port, subpath, outputKind } = item as Record<string, unknown>;
    if (typeof port !== "string" || port.length === 0) {
      throw new Error("files.load: slot port name must be a non-empty string");
    }
    if (!PORT_NAME_RE.test(port)) {
      throw new Error(`files.load: port "${port}" must match ${PORT_NAME_RE}`);
    }
    if (seen.has(port)) {
      throw new Error(`files.load: duplicate port "${port}"`);
    }
    if (typeof subpath !== "string" || subpath.trim().length === 0) {
      throw new Error(`files.load: port "${port}" needs a non-empty subpath`);
    }
    if (typeof outputKind !== "string" || !isFileLoadKind(outputKind)) {
      throw new Error(
        `files.load: port "${port}" has unsupported outputKind "${String(outputKind)}" (only Markdown and Json are supported).`,
      );
    }
    seen.add(port);
    out.push({ port, subpath: subpath.trim(), outputKind });
  }
  return out;
};

/**
 * Répertoire de base : l'input `path` (forme `Path` → `payload.path`, scalaire
 * `String` → `payload.value`, envelope texte → `payload.body`, sinon `content`)
 * l'emporte sur `config.path` — même sémantique que `file.load`. La garde de
 * chemin absolu est portée par {@link readFileToArtifact}, mais on l'asserte ici
 * aussi pour que `path.resolve(base, subpath)` + le containment soient fiables.
 */
const resolveBase = (ctx: RunContext): string => {
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
  const base = fromInput ?? readStr(ctx.step.config["path"]);
  if (!base) {
    throw new Error(
      "files.load: no base directory (wire the `path` input or set config.path).",
    );
  }
  const resolved = ctx.deps.path.resolve(base);
  if (resolved !== base) {
    throw new Error(
      `files.load: base \`path\` must be absolute (got "${base}")`,
    );
  }
  return resolved;
};

export const createFilesLoadRunner = (): StepRunner => ({
  kind: "files.load",

  resolveSpec({ config }): NodeSpec {
    // Permissif tant que les slots ne sont pas (encore) valides : outputs [] —
    // comme file.load / webhook.call quand le discriminateur manque.
    let slots: ReadonlyArray<Slot> = [];
    try {
      slots = readSlots(config);
    } catch {
      /* base spec permissive */
    }
    return {
      title: "Load Files",
      description:
        "Lit N fichiers sous un répertoire de base (input `path` ou config) et expose chacun sur son port (Markdown ou Json).",
      inputs: [
        {
          name: "path",
          kinds: ["Path", "String", "Markdown", "*"],
          optional: true,
          primary: true,
        },
      ],
      outputs: slots.map((s, i) => ({
        name: s.port,
        kind: s.outputKind,
        primary: i === 0,
        description: `${s.subpath} → ${s.outputKind}`,
      })),
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const slots = readSlots(ctx.step.config);
    const base = resolveBase(ctx);
    const produced: ProducedSlot[] = [];
    for (const s of slots) {
      const resolved = ctx.deps.path.resolve(base, s.subpath);
      // `resolve` réécrit déjà les `..` et ignore la base sur un subpath absolu ;
      // on vérifie que le résultat reste contenu dans la base (anti-évasion).
      const within =
        resolved === base || resolved.startsWith(base + ctx.deps.path.sep);
      if (!within) {
        throw new Error(
          `files.load: subpath "${s.subpath}" escapes the base directory (${base})`,
        );
      }
      const artifact = await readFileToArtifact(
        ctx,
        resolved,
        s.outputKind,
        "files.load",
      );
      produced.push({ port: s.port, artifact });
    }
    return { kind: "produced-many", artifacts: produced };
  },
});
