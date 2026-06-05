/**
 * Runner du step kind "files.load-manifest".
 *
 * Charge N fichiers dont les noms sont LUS AU RUNTIME dans l'entrée `source`
 * (tableau JSONPath `config.selector`), résolus sous une base (`path`) + subdir,
 * et émet leur concaténation (chacun wrappé `{name}`) en UN seul Markdown `out`.
 * Tableau vide → Markdown vide. TOUJOURS `produced` (pas de port mort) : câblable
 * tel quel dans un loop.foreach et un concat.markdown aval. Déterministe, sans LLM.
 *
 * Réutilise le cœur de lecture/validation/stockage de `file.load`
 * ({@link readFileToArtifact} — early-fail JSON, meta `byteLength`/`path`) et le
 * garde de containment de `files.load` (pas d'évasion hors de la base). À la
 * différence de `select.markdown`, le sélecteur renvoie un **tableau** (0..N) :
 * 0 match → sortie vide valide, jamais une erreur d'« exactement 1 ».
 */
import { JSONPath } from "jsonpath-plus";
import {
  textToArtifact,
  isFileLoadKind,
  type FileLoadKind,
} from "./file-load";
import { putArtifactPayload } from "../application/artifact-io";
import { serializeFromString } from "../domain/artifact-serializer";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import {
  groupInputsByPort,
  type NodeSpec,
  type RunContext,
  type RunContextInput,
  type StepOutcome,
  type StepRunner,
} from "../application/step-runner";

/**
 * Strips a leading Markdown code fence around the payload — `shell.exec` wraps
 * its stdout that way, so a JSON-emitting script piped through it arrives
 * fenced. Identique au `stripCodeFence` de `select.markdown` / `branch.json`.
 */
const FENCE_RE = /`{3,}[^\n]*\n([\s\S]*?)\n`{3,}/;
const stripCodeFence = (raw: string): string => {
  const m = FENCE_RE.exec(raw);
  return m ? m[1] : raw;
};

const readStr = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

const bodyOf = (input: RunContextInput): string => {
  const payload = input.payload;
  if (payload && typeof payload === "object" && "body" in payload) {
    const body = (payload as { body?: unknown }).body;
    if (typeof body === "string") return body;
  }
  return input.content;
};

/** Substitue toutes les occurrences de `{name}` (lib < es2021, pas de replaceAll). */
const fillName = (template: string, name: string): string =>
  template.split("{name}").join(name);

type Wrap = { header: string; footer: string };

/**
 * Lit `config.wrap` ({ header?, footer? }), défauts vides : sans `wrap` les
 * bodies sont concaténés bruts. Le gabarit du picker (`buildDefaultConfig`)
 * fournit le `<file name="{name}">…</file>` par défaut côté UI, pas le runtime.
 */
const readWrap = (config: Readonly<Record<string, unknown>>): Wrap => {
  const raw = config["wrap"];
  if (!raw || typeof raw !== "object") return { header: "", footer: "" };
  const w = raw as Record<string, unknown>;
  return {
    header: typeof w["header"] === "string" ? w["header"] : "",
    footer: typeof w["footer"] === "string" ? w["footer"] : "",
  };
};

const readOutputKind = (
  config: Readonly<Record<string, unknown>>,
): FileLoadKind => {
  const k = readStr(config["outputKind"]) ?? "Json";
  if (!isFileLoadKind(k)) {
    throw new Error(
      `files.load-manifest: unsupported outputKind "${k}" (only Markdown and Json are supported).`,
    );
  }
  return k;
};

/**
 * Répertoire de base depuis l'input `path` (forme `Path` → `payload.path`,
 * scalaire `String` → `payload.value`, envelope texte → `payload.body`, sinon
 * `content`) — mirror `files.load.resolveBase`. `base` doit être **absolu**.
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
  if (!fromInput) {
    throw new Error(
      "files.load-manifest: no base directory (wire the `path` input).",
    );
  }
  const resolved = ctx.deps.path.resolve(fromInput);
  if (resolved !== fromInput) {
    throw new Error(
      `files.load-manifest: base \`path\` must be absolute (got "${fromInput}")`,
    );
  }
  return resolved;
};

/**
 * Parse `source` (fencé toléré) en JSON, évalue `selector` → tableau de noms de
 * fichiers (chaînes). Tout match non-chaîne → StepFailed. 0 match est valide.
 */
const readFileNames = (
  ctx: RunContext,
  selector: string,
): ReadonlyArray<string> => {
  const source =
    ctx.inputs.find((i) => i.port === "source") ?? ctx.inputs[0];
  if (!source) {
    throw new Error(
      "files.load-manifest: missing artifact on input port `source`",
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(bodyOf(source)));
  } catch (err) {
    throw new Error(
      `files.load-manifest: source input is not valid JSON (${(err as Error).message})`,
    );
  }

  // jsonpath-plus throw sur expression invalide → StepFailed. `sandbox` jamais
  // désactivé (mirror branch.json / select.markdown).
  const matches = JSONPath<unknown[]>({
    path: selector,
    json: data as object,
    wrap: true,
  });

  return matches.map((m, i) => {
    if (typeof m !== "string") {
      throw new Error(
        `files.load-manifest: selector "${selector}" matched a non-string entry at index ${i}`,
      );
    }
    return m;
  });
};

export const createFilesLoadManifestRunner = (): StepRunner => ({
  kind: "files.load-manifest",

  resolveSpec(): NodeSpec {
    // Signature 100% statique → ne throw jamais (≠ select.markdown / file.load) :
    // `listNodeSpecs` retourne directement les bons ports, sans fallback permissif.
    return {
      title: "Load Files (manifest)",
      description:
        "Charge les fichiers nommés dans un tableau JSONPath de `source`, résolus sous `path`+subdir, et émet leur concaténation (wrappée) en un seul Markdown. Tableau vide → vide. Toujours produit.",
      inputs: [
        { name: "source", kinds: ["*"], primary: true },
        {
          name: "path",
          kinds: ["Path", "String", "Markdown", "*"],
          optional: true,
        },
      ],
      outputs: [{ name: "out", kind: "Markdown", primary: true }],
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const config = ctx.step.config;
    const selector = readStr(config["selector"]) ?? "$.files[*]";
    const subdir =
      typeof config["subdir"] === "string" ? config["subdir"] : "";
    const outputKind = readOutputKind(config);
    const wrap = readWrap(config);
    const separator =
      typeof config["separator"] === "string" ? config["separator"] : "\n\n";
    const dedupe = config["dedupe"] !== false; // défaut true
    const onMissing = config["onMissing"] === "skip" ? "skip" : "fail";
    const maxFiles =
      typeof config["maxFiles"] === "number" && config["maxFiles"] > 0
        ? config["maxFiles"]
        : undefined;

    const raw = readFileNames(ctx, selector);
    const names = dedupe ? [...new Set(raw)] : [...raw];

    if (maxFiles !== undefined && names.length > maxFiles) {
      throw new Error(
        `files.load-manifest: selector matched ${names.length} files (> maxFiles ${maxFiles})`,
      );
    }

    const base = resolveBase(ctx);

    const segments: string[] = [];
    for (const name of names) {
      const resolved = ctx.deps.path.resolve(base, subdir, name);
      // `resolve` réécrit déjà les `..` et ignore la base sur un nom absolu ;
      // on vérifie que le résultat reste contenu dans la base (anti-évasion).
      const within =
        resolved === base || resolved.startsWith(base + ctx.deps.path.sep);
      if (!within) {
        throw new Error(
          `files.load-manifest: name "${name}" escapes the base directory (${base})`,
        );
      }

      let body: string;
      try {
        body = await ctx.deps.fs.readTextFile(resolved);
      } catch (err) {
        // `onMissing: "skip"` tolère le seul fichier introuvable ; tout autre
        // échec (JSON malformé ci-dessous) reste un StepFailed dur.
        if (onMissing === "skip") continue;
        throw err;
      }
      // Body vide : omis (textToArtifact le rejetterait — cf. file.load).
      if (body.length === 0) continue;
      // Valide (early-fail JSON) + stocke un artifact par fichier (traçabilité,
      // meta `byteLength`/`path`) ; on garde le body pour la concat. Mirror
      // `readFileToArtifact`, sans le ré-assertAbsolute (containment l'a garanti).
      await textToArtifact(ctx, body, outputKind, "files.load-manifest", {
        source: "files.load-manifest",
        path: resolved,
        byteLength: String(Buffer.byteLength(body, "utf-8")),
      });

      segments.push(
        fillName(wrap.header, name) + body + fillName(wrap.footer, name),
      );
    }

    const concat = segments.join(separator);
    const payload = serializeFromString(
      "Markdown",
      concat,
    ) as ArtifactPayload<"Markdown">;
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      payload,
      {
        source: "files.load-manifest",
        selector,
        count: String(segments.length),
      },
    );
    return { kind: "produced", artifact };
  },
});
