import {
  kindForArtifactSchema,
  type ArtifactKind,
  type ArtifactSchemaView,
  type DebugStepResultView,
  type NodeSpecView,
} from "../../../../domain/workflow/types";
import { ARTIFACT_KINDS } from "../../../components/templates/step-kinds";

/**
 * Une saisie utilisateur dans le formulaire d'inputs du studio.
 * Pour les ports `isList`, plusieurs `StudioInputDraft` partagent le même
 * `port`. Pour les ports `optional`, l'absence dans la liste = non fourni.
 */
export type StudioInputDraft = {
  /** Nom du port (matche `NodeSpec.inputs[].name`). */
  readonly port: string;
  /** Kind choisi pour cet input (utile pour les ports polymorphes / wildcards). */
  readonly kind: ArtifactKind;
  /** Contenu brut saisi dans le textarea — sera serialisé en artifact. */
  readonly content: string;
  /**
   * Pour les ports `optional` : `true` si l'utilisateur a coché "Inclure cet
   * input". Pour les ports non-optionnels, toujours `true`.
   */
  readonly included: boolean;
};

export type StudioRunState =
  | { status: "idle" }
  | { status: "running"; startedAt: number }
  | {
      status: "done";
      result: DebugStepResultView;
      durationMs: number;
    };

/**
 * Choisit un kind initial pour un port donné.
 *  - port monomorphe → l'unique kind accepté.
 *  - port polymorphe → le premier kind accepté.
 *  - wildcard `*` → `Markdown` (kind le plus permissif, l'utilisateur peut
 *    changer dans le select).
 */
const defaultKindForPort = (
  acceptedKinds: ReadonlyArray<string>,
): ArtifactKind => {
  if (acceptedKinds.length === 0 || acceptedKinds.includes("*")) {
    return "Markdown";
  }
  return acceptedKinds[0] as ArtifactKind;
};

/**
 * Construit l'état initial du formulaire à partir d'une `NodeSpec` résolue.
 * Un input par port déclaré ; pour les `isList` on n'en crée qu'un seul
 * (l'utilisateur ajoute les autres via "+ Ajouter une entrée").
 */
export const seedFromSpec = (
  spec: Pick<NodeSpecView, "inputs">,
): StudioInputDraft[] =>
  spec.inputs.map((port) => ({
    port: port.name,
    kind: defaultKindForPort(port.kinds),
    content: "",
    included: !port.optional,
  }));

/**
 * Vérifie que tous les ports non-optionnels et non-isList sont remplis avec un
 * contenu non-vide. Pour les ports `isList`, on accepte 0 entrée (le runner
 * gère la liste vide ou throw — c'est son contrat).
 */
export const allRequiredFilled = (
  spec: Pick<NodeSpecView, "inputs">,
  inputs: ReadonlyArray<StudioInputDraft>,
): boolean => {
  for (const port of spec.inputs) {
    if (port.optional) continue;
    const entries = inputs.filter(
      (i) => i.port === port.name && i.included,
    );
    if (entries.length === 0) return false;
    for (const entry of entries) {
      if (entry.content.trim().length === 0) return false;
    }
  }
  return true;
};

/**
 * Aplatit le state du formulaire vers le payload IPC : on filtre les inputs
 * non inclus (ports optional non cochés).
 */
export const toIpcInputs = (
  inputs: ReadonlyArray<StudioInputDraft>,
): ReadonlyArray<{ port: string; kind: ArtifactKind; content: string }> =>
  inputs
    .filter((i) => i.included)
    .map((i) => ({ port: i.port, kind: i.kind, content: i.content }));

/**
 * Kinds proposables pour un port wildcard (`*`) : les builtin scalaires plus
 * tous les kinds dynamiques (plugin/user) du registre runtime. Calculé depuis
 * `listArtifactSchemas()` plutôt qu'une liste statique → un type contribué par un
 * plugin apparaît automatiquement, rien à oublier.
 */
export const buildWildcardKindChoices = (
  types: ReadonlyArray<ArtifactSchemaView>,
): ReadonlyArray<ArtifactKind> => [
  ...ARTIFACT_KINDS,
  ...types
    .filter((t) => t.source.kind !== "builtin")
    .map(kindForArtifactSchema),
];
