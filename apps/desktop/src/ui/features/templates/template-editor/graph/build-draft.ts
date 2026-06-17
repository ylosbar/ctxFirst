/**
 * Construction + validation du brouillon de template à partir du graphe.
 *
 * `buildTemplateDraft` sérialise les nodes/edges/variables (+ méta) en
 * `TemplateDraft` : il dérive les transitions (avec la subtilité auto-loop vs
 * human-feedback sur le `fromPort`) et calcule les `exitSteps` (steps sans
 * transition sortante non-loop).
 *
 * `validateTemplateDraft` reproduit la validation locale d'avant-save : champs
 * requis, unicité des IDs, entry connu, puis — si le catalogue de specs est
 * chargé — typabilité des transitions (§2) et cardinalité des ports (non-isList
 * = une seule entrée).
 *
 * Les deux sont **purs** (aucune closure sur le state React) → testables
 * unitairement, et partagés par `useTemplateSave`.
 */
import type { Edge, Node } from "@xyflow/react";

import { transitionTypable } from "@shared/wf/port-accepts";
import type { TemplateVariableView } from "@shared/wf/types";
import type {
  ArtifactKind,
  TemplateDraft,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import { AUTO_LOOP_SOURCE_KINDS } from "./ids";
import { nodesToSteps } from "./nodes-to-steps";
import { resolveStepSpec, type ByKind, type SkillBodies } from "./step-spec";
import type { EdgeData } from "./edge-style";

export type BuildTemplateDraftInput = {
  nodes: ReadonlyArray<Node>;
  edges: ReadonlyArray<Edge>;
  templateId: string;
  version: string;
  name: string;
  description: string;
  entryStepId: string | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
  status: "draft" | "published";
};

export type TemplateDraftOverrides = {
  name?: string;
  id?: string;
  version?: string;
  status?: "draft" | "published";
};

export const buildTemplateDraft = (
  input: BuildTemplateDraftInput,
  overrides?: TemplateDraftOverrides,
): TemplateDraft => {
  const {
    nodes,
    edges,
    templateId,
    version,
    name,
    description,
    entryStepId,
    variables,
    status,
  } = input;
  const steps: TemplateStepDraft[] = nodesToSteps(nodes);
  const kindById = new Map(steps.map((s) => [s.id, s.kind]));
  const transitions = edges.map((e) => {
    const data = e.data as (EdgeData & { order?: number }) | undefined;
    const isLoop = data?.isLoop ?? false;
    // A pinned `fromPort` on a loop edge marks an *auto-loop* (orchestrator
    // re-invokes automatically), which the save-time whitelist restricts to
    // `llm.judge` / `format.validate`. Any other source looping back is a
    // *human-feedback* loop — it must NOT carry a `fromPort`, else it both
    // trips the whitelist and makes the orchestrator auto-loop forever after
    // "Valider". See `validateAutoLoopWhitelist`.
    const isAutoLoopSource =
      isLoop && AUTO_LOOP_SOURCE_KINDS.has(kindById.get(e.source) ?? "");
    const fromPort =
      isLoop && !isAutoLoopSource ? undefined : e.sourceHandle ?? undefined;
    return {
      from: e.source,
      fromPort,
      to: e.target,
      toPort: e.targetHandle ?? undefined,
      isLoop,
      ...(typeof data?.order === "number" ? { order: data.order } : {}),
    };
  });
  const outgoing = new Set(
    transitions.filter((t) => !t.isLoop).map((t) => t.from),
  );
  const exitSteps = steps.map((s) => s.id).filter((id) => !outgoing.has(id));
  return {
    id: (overrides?.id ?? templateId).trim(),
    version: (overrides?.version ?? version).trim(),
    name: (overrides?.name ?? name).trim(),
    description: description.trim(),
    entryStep: entryStepId ?? "",
    exitSteps,
    steps,
    transitions,
    variables,
    // Par défaut on préserve le statut courant (un simple Save ne dé-publie
    // pas) ; la publication passe explicitement `status: "published"`.
    status: overrides?.status ?? status,
  };
};

export type ValidateTemplateDraftDeps = {
  byKind: ByKind | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
  subTemplates: Map<string, ReadonlyArray<TemplateVariableView>>;
  skillBodies: SkillBodies;
  refinementResolver: (
    kind: string,
  ) => { extends: ArtifactKind | null; structuralHash: string } | null;
};

export const validateTemplateDraft = (
  draft: TemplateDraft,
  deps: ValidateTemplateDraftDeps,
): string | null => {
  const { byKind, variables, subTemplates, skillBodies, refinementResolver } =
    deps;
  if (!draft.id) return "L'ID du template est requis.";
  if (!draft.version) return "La version est requise.";
  if (!draft.name) return "Le nom est requis.";
  if (draft.steps.length === 0) return "Ajoute au moins une étape.";
  if (!draft.entryStep) return "Choisis une étape d'entrée.";
  const ids = new Set<string>();
  for (const s of draft.steps) {
    if (!s.id) return `Une étape n'a pas d'ID.`;
    if (ids.has(s.id)) return `ID d'étape dupliqué : ${s.id}`;
    ids.add(s.id);
  }
  if (!ids.has(draft.entryStep)) {
    return `L'étape d'entrée "${draft.entryStep}" est inconnue.`;
  }
  if (byKind) {
    const stepById = new Map(draft.steps.map((s) => [s.id, s]));
    // Track edges-per-(target, port) for cardinality on non-isList ports.
    const cardinality = new Map<string, number>();
    for (const t of draft.transitions) {
      if (t.isLoop) continue;
      const src = stepById.get(t.from);
      const dst = stepById.get(t.to);
      if (!src || !dst) return `Transition orpheline : ${t.from} → ${t.to}`;
      const srcSpec = resolveStepSpec(src, byKind, variables, subTemplates, skillBodies);
      const dstSpec = resolveStepSpec(dst, byKind, variables, subTemplates, skillBodies);
      if (!srcSpec || !dstSpec) continue;
      if (
        !transitionTypable(srcSpec, dstSpec, {
          fromPort: t.fromPort,
          toPort: t.toPort,
          resolver: refinementResolver,
        })
      ) {
        const srcOut =
          (t.fromPort
            ? srcSpec.outputs.find((o) => o.name === t.fromPort)?.kind
            : srcSpec.outputs[0]?.kind) ?? "—";
        const dstAccepted = dstSpec.inputs
          .map((p) => p.kinds.join("|"))
          .join(" / ");
        return `Incompatibilité d'artefact : ${src.id} produit ${srcOut}, mais ${dst.id} n'accepte que [${dstAccepted || "∅"}].`;
      }
      const portName = t.toPort ?? dstSpec.inputs[0]?.name;
      if (!portName) continue;
      const port = dstSpec.inputs.find((p) => p.name === portName);
      if (!port) continue;
      if (dstSpec.inputs.length > 1 && !t.toPort) {
        return `Transition ${t.from} → ${t.to} : préciser un port cible (le node a ${dstSpec.inputs.length} entrées).`;
      }
      if (port.isList && !t.toPort) {
        return `Transition ${t.from} → ${t.to} : le port "${port.name}" est isList — préciser un toPort explicite.`;
      }
      const key = `${t.to}|${portName}`;
      const next = (cardinality.get(key) ?? 0) + 1;
      cardinality.set(key, next);
      if (!port.isList && next > 1) {
        return `Le port "${portName}" de ${t.to} n'est pas isList : il ne peut pas recevoir ${next} transitions entrantes.`;
      }
    }
  }
  return null;
};
