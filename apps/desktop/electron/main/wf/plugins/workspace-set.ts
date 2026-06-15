/**
 * Runner du step kind "workspace.set".
 *
 * Effet pur sur l'état d'instance : pose le `cwd` qui sera utilisé par les
 * étapes natives suivantes (typiquement `claude_code.invoke` → CLI Claude). Aucun
 * artefact produit ; l'orchestrateur émet `WorkspaceChanged` puis valide
 * automatiquement le step.
 *
 * Le `cwd` provient en priorité de `step.config.cwd` (champ saisi dans
 * l'inspecteur de la node). S'il est vide, le runner se rabat sur un artefact
 * `Path` câblé sur le port d'entrée — typiquement la sortie d'un `git.clone`
 * passée via `readsFrom: { in: <var> }` — et en lit le champ `path`. Cela rend
 * la node utilisable avec un workspace **dynamique** (cloner puis travailler
 * dans le clone), sans avoir à connaître le chemin absolu à l'avance.
 *
 * L'unique port accepte n'importe quel kind (`*`) pour rester chainable ; seuls
 * les inputs de kind `Path` sont consultés pour le `cwd`, les autres servent
 * uniquement au chaînage du flow.
 */
import type {
  NodeSpec,
  RunContextInput,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";

type PathLike = { path?: unknown };

/** Extrait un chemin (trimmed) d'un payload `Path` ou de son JSON brut. */
const readPath = (value: unknown): string => {
  if (value && typeof value === "object") {
    const p = (value as PathLike).path;
    if (typeof p === "string" && p.trim().length > 0) return p.trim();
  }
  return "";
};

/**
 * Cherche un `cwd` dans les inputs câblés quand `config.cwd` est vide. On lit
 * le `{ path }` du premier artefact de kind `Path` ; en modes de validation
 * dégradés (log-only / rollback) où `payload` est `null`, on retombe sur le
 * `content` JSON brut. Les inputs d'un autre kind sont ignorés (chaînage seul).
 */
const cwdFromInputs = (inputs: ReadonlyArray<RunContextInput>): string => {
  for (const input of inputs) {
    if (input.kind !== "Path") continue;
    const fromPayload = readPath(input.payload);
    if (fromPayload) return fromPayload;
    try {
      const fromContent = readPath(JSON.parse(input.content));
      if (fromContent) return fromContent;
    } catch {
      // content n'est pas du JSON-v1 — on ignore et on continue le scan.
    }
  }
  return "";
};

export const createWorkspaceSetRunner = (): StepRunner => ({
  kind: "workspace.set",

  resolveSpec(): NodeSpec {
    return {
      title: "Workspace Set",
      description: "Sets the working directory for subsequent native steps.",
      // Wildcard input: stays chainable with any kind. A wired `Path` artifact
      // (e.g. `git.clone`'s output via `readsFrom`) is consumed as the `cwd`
      // fallback when `config.cwd` is empty; other kinds are ignored at runtime.
      inputs: [{ name: "in", kinds: ["*"], optional: true }],
      outputs: [],
      // Pure side-effect: emits no artifact but stays chainable. The
      // orchestrator's `previousDataStepId` skips over this kind when
      // resolving inputs for the downstream step.
      passthrough: true,
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const fromConfig =
      typeof cfg["cwd"] === "string" ? (cfg["cwd"]).trim() : "";
    const cwd = fromConfig || cwdFromInputs(ctx.inputs);
    if (!cwd) {
      throw new Error(
        "workspace.set requires `step.config.cwd` to be set, or a `Path` artifact wired into the `in` port",
      );
    }
    return { kind: "workspace-set", cwd };
  },
});
