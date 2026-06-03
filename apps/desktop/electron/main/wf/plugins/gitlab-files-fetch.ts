/**
 * Runner du step kind "gitlab.files.fetch".
 *
 * Pendant **distant** de `files.load` : récupère N fichiers d'un dépôt GitLab
 * via l'API REST « raw file » (`/repository/files/:path/raw`), sans cloner le
 * repo. L'utilisateur déclare un `basePath` (préfixe relatif au dépôt) et N
 * slots `{ port, subpath, outputKind }` ; chaque slot lit le fichier situé à
 * `joinRepoPath(basePath, subpath)` et l'expose sur **son port de sortie
 * nommé**. Émet un outcome `produced-many` couvrant tous les ports déclarés.
 *
 * Réutilise tel quel le cœur de validation/stockage de `file.load`
 * ({@link textToArtifact}) — mêmes kinds text-envelope (`Markdown` | `Json`),
 * même validation JSON early-fail — et les helpers HTTP de `gitlab-api.ts`.
 *
 * ⚠ Les chemins de dépôt sont **POSIX** (séparateur `/`), indépendants de l'OS
 * hôte : on **n'utilise pas** `ctx.deps.path.resolve` (sémantique système de
 * fichiers, backslashes sous Windows), mais le helper pur {@link joinRepoPath}.
 */
import { textToArtifact, isFileLoadKind, type FileLoadKind } from "./file-load";
import {
  encodeProjectId,
  gitlabRequest,
  normalizeBaseUrl,
  resolveGitLabToken,
  type GitLabApiDeps,
} from "./gitlab-api";
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

const readStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

const readNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const inputPayload = (ctx: RunContext): Record<string, unknown> | null => {
  const input = groupInputsByPort(ctx.inputs).get("in")?.[0];
  return input?.payload && typeof input.payload === "object"
    ? (input.payload as Record<string, unknown>)
    : null;
};

/**
 * Joint un `subpath` (relatif au dépôt) à un `basePath` (préfixe relatif au
 * dépôt) en **sémantique POSIX pure** :
 *
 * 1. Normalise `basePath` (ignore segments vides + `.`, `..` dépile).
 * 2. Empile les segments de `subpath` par-dessus ; `..` dépile **mais ne peut
 *    pas descendre sous `basePath`** (évasion refusée, cohérence stricte avec le
 *    containment de `files.load` — cf. spec §5/§11).
 * 3. Rejoint avec `/`, **sans slash initial** (chemin relatif au repo).
 */
export const joinRepoPath = (basePath: string, subpath: string): string => {
  const segments = (p: string): string[] =>
    p.split("/").filter((s) => s.length > 0 && s !== ".");

  // Préfixe normalisé. Un `..` qui remonterait au-dessus de la racine du repo
  // est refusé (basePath invalide).
  const base: string[] = [];
  for (const seg of segments(basePath)) {
    if (seg === "..") {
      if (base.length === 0) {
        throw new Error(
          `gitlab.files.fetch: basePath "${basePath}" escapes the repository root`,
        );
      }
      base.pop();
      continue;
    }
    base.push(seg);
  }

  const stack = [...base];
  const floor = base.length;
  for (const seg of segments(subpath)) {
    if (seg === "..") {
      if (stack.length <= floor) {
        throw new Error(
          `gitlab.files.fetch: subpath "${subpath}" escapes the base path`,
        );
      }
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join("/");
};

/**
 * Parse + valide `config.slots` ; throw avec un message explicite par règle
 * (cf. tableau de validation de la spec §11). Miroir du validateur de
 * `files.load`. Le subpath doit être non vide ; le containment (reste sous
 * `basePath`) est vérifié au run par {@link joinRepoPath}, une fois la base
 * résolue.
 */
const readSlots = (
  config: Readonly<Record<string, unknown>>,
): ReadonlyArray<Slot> => {
  const raw = config["slots"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("gitlab.files.fetch requires config.slots[] (≥ 1)");
  }
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new Error("gitlab.files.fetch: each slot must be an object");
    }
    const { port, subpath, outputKind } = item as Record<string, unknown>;
    if (typeof port !== "string" || port.length === 0) {
      throw new Error(
        "gitlab.files.fetch: slot port name must be a non-empty string",
      );
    }
    if (!PORT_NAME_RE.test(port)) {
      throw new Error(
        `gitlab.files.fetch: port "${port}" must match ${PORT_NAME_RE}`,
      );
    }
    if (seen.has(port)) {
      throw new Error(`gitlab.files.fetch: duplicate port "${port}"`);
    }
    if (typeof subpath !== "string" || subpath.trim().length === 0) {
      throw new Error(
        `gitlab.files.fetch: port "${port}" needs a non-empty subpath`,
      );
    }
    if (typeof outputKind !== "string" || !isFileLoadKind(outputKind)) {
      throw new Error(
        `gitlab.files.fetch: port "${port}" has unsupported outputKind "${String(outputKind)}" (only Markdown and Json are supported).`,
      );
    }
    seen.add(port);
    out.push({ port, subpath: subpath.trim(), outputKind });
  }
  return out;
};

export const createGitlabFilesFetchRunner = (
  deps: GitLabApiDeps = {},
): StepRunner => ({
  kind: "gitlab.files.fetch",

  resolveSpec({ config }): NodeSpec {
    // Permissif tant que les slots ne sont pas (encore) valides : outputs [] —
    // comme files.load / file.load / webhook.call quand le discriminateur manque.
    let slots: ReadonlyArray<Slot> = [];
    try {
      slots = readSlots(config);
    } catch {
      /* base spec permissive */
    }
    return {
      title: "GitLab: fetch files",
      description:
        "Fetches N files from a GitLab repo (pinned ref) via the REST API and exposes each on its own port (Markdown or Json).",
      inputs: [{ name: "in", kinds: ["Json", "*"], optional: true }],
      outputs: slots.map((s, i) => ({
        name: s.port,
        kind: s.outputKind,
        primary: i === 0,
        description: `${s.subpath} → ${s.outputKind}`,
      })),
    };
  },

  async run(ctx: RunContext): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const payload = inputPayload(ctx);
    const slots = readSlots(cfg);

    // `project` / `ref` / `basePath` : l'input `in` l'emporte sur la config.
    const project =
      readStr(payload?.["project"]) ??
      readStr(cfg["project"]) ??
      (readNum(payload?.["project"]) ?? readNum(cfg["project"]))?.toString() ??
      null;
    if (!project) {
      throw new Error(
        "gitlab.files.fetch: missing `project` (numeric id or `group/project` path).",
      );
    }
    const ref = readStr(payload?.["ref"]) ?? readStr(cfg["ref"]) ?? "";
    const basePath =
      readStr(payload?.["basePath"]) ?? readStr(cfg["basePath"]) ?? "";

    const baseUrl = normalizeBaseUrl(cfg["baseUrl"]);
    const token = resolveGitLabToken(ctx, deps, "gitlab.files.fetch");

    ctx.deps.logger.info(
      `[gitlab.files.fetch] project=${project} ref=${ref || "(default)"} base=${basePath || "(root)"} (${slots.length} files)`,
    );

    const produced: ProducedSlot[] = [];
    for (const slot of slots) {
      // Anti-traversal POSIX : throw avant tout appel réseau si évasion.
      const filePath = joinRepoPath(basePath, slot.subpath);
      const encFilePath = encodeURIComponent(filePath);
      const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const res = await gitlabRequest({
        baseUrl,
        token,
        method: "GET",
        path: `/projects/${encodeProjectId(project)}/repository/files/${encFilePath}/raw${refQuery}`,
      });

      if (res.status === 404) {
        throw new Error(
          `gitlab.files.fetch: file not found "${filePath}" at ref "${ref || "(default)"}"`,
        );
      }
      if (!res.ok) {
        throw new Error(
          `gitlab.files.fetch: HTTP ${res.status} fetching "${filePath}": ${res.text.slice(0, 300)}`,
        );
      }

      const artifact = await textToArtifact(
        ctx,
        res.text,
        slot.outputKind,
        "gitlab.files.fetch",
        {
          source: "gitlab.files.fetch",
          project,
          ref,
          filePath,
          byteLength: String(Buffer.byteLength(res.text, "utf-8")),
        },
      );
      produced.push({ port: slot.port, artifact });
    }

    return { kind: "produced-many", artifacts: produced };
  },
});
