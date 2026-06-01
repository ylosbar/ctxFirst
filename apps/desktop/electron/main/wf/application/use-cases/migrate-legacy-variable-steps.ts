/**
 * Compat shim that rewrites templates persisted with the removed
 * `variable.set` / `variable.get` step kinds into the structural
 * `writesTo` / `readsFrom` form. Applied at load time by the template
 * registry; idempotent (post-migration no `variable.*` step remains, so a
 * second pass is a no-op).
 *
 * The algorithm and the prerequisites it enforces are specified in
 * `specs/remove-variable-set-get-steps.md` (§8 + cas limites 1–4). Steps
 * whose prerequisites are not met are left untouched and reported via
 * `skipped`; the engine's port validation will then reject the template
 * with a "no runner registered" error, forcing the user to resolve it by
 * editing the template manually.
 */
import type { StepId } from "../../domain/ids";
import type {
  StepDef,
  Transition,
  WorkflowTemplate,
} from "../../domain/template";

export type MigrationSkipReason =
  | "no-incoming-transition"
  | "multiple-incoming-transitions"
  | "no-outgoing-transition"
  | "missing-variable-name"
  | "upstream-not-found"
  | "downstream-not-found";

export type MigrationSkipped = {
  stepId: StepId;
  kind: "variable.set" | "variable.get";
  reason: MigrationSkipReason;
  message: string;
};

export type MigrationResult = {
  template: WorkflowTemplate;
  changed: boolean;
  skipped: ReadonlyArray<MigrationSkipped>;
};

const readVarName = (config: Readonly<Record<string, unknown>>): string | null => {
  const v = config["variableName"];
  return typeof v === "string" && v.length > 0 ? v : null;
};

const transitionEquals = (a: Transition, b: Transition): boolean =>
  a.from === b.from &&
  a.to === b.to &&
  a.isLoop === b.isLoop &&
  (a.fromPort ?? null) === (b.fromPort ?? null) &&
  (a.toPort ?? null) === (b.toPort ?? null) &&
  (a.order ?? null) === (b.order ?? null);

const replaceStep = (
  steps: StepDef[],
  id: StepId,
  patch: Partial<StepDef>,
): void => {
  const idx = steps.findIndex((s) => s.id === id);
  if (idx < 0) return;
  steps[idx] = { ...steps[idx], ...patch };
};

export const migrateLegacyVariableSteps = (
  tpl: WorkflowTemplate,
): MigrationResult => {
  const hasLegacy = tpl.steps.some(
    (s) => s.kind === "variable.set" || s.kind === "variable.get",
  );
  if (!hasLegacy) {
    return { template: tpl, changed: false, skipped: [] };
  }

  const steps: StepDef[] = tpl.steps.map((s) => ({ ...s }));
  let transitions: Transition[] = tpl.transitions.map((t) => ({ ...t }));
  const skipped: MigrationSkipped[] = [];

  const removeStepAndItsTransitions = (id: StepId): void => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx >= 0) steps.splice(idx, 1);
    transitions = transitions.filter((t) => t.from !== id && t.to !== id);
  };

  // Pass 1: variable.set → producer.writesTo
  for (const step of [...steps]) {
    if (step.kind !== "variable.set") continue;
    const varName = readVarName(step.config);
    if (!varName) {
      skipped.push({
        stepId: step.id,
        kind: "variable.set",
        reason: "missing-variable-name",
        message: `step ${step.id} (variable.set): missing config.variableName`,
      });
      continue;
    }

    const incomingNonLoop = transitions.filter(
      (t) => !t.isLoop && t.to === step.id,
    );
    if (incomingNonLoop.length === 0) {
      skipped.push({
        stepId: step.id,
        kind: "variable.set",
        reason: "no-incoming-transition",
        message: `step ${step.id} (variable.set "${varName}"): no incoming non-loop transition — cannot determine producer`,
      });
      continue;
    }
    if (incomingNonLoop.length > 1) {
      skipped.push({
        stepId: step.id,
        kind: "variable.set",
        reason: "multiple-incoming-transitions",
        message: `step ${step.id} (variable.set "${varName}"): ${incomingNonLoop.length} incoming non-loop transitions, expected 1`,
      });
      continue;
    }

    const tIn = incomingNonLoop[0];
    const producer = steps.find((s) => s.id === tIn.from);
    if (!producer) {
      skipped.push({
        stepId: step.id,
        kind: "variable.set",
        reason: "upstream-not-found",
        message: `step ${step.id} (variable.set "${varName}"): upstream step ${tIn.from} not in template`,
      });
      continue;
    }

    const fromPort = tIn.fromPort ?? "out";
    const nextWritesTo = { ...(producer.writesTo ?? {}), [fromPort]: varName };
    replaceStep(steps, producer.id, { writesTo: nextWritesTo });

    const outgoing = transitions.filter((t) => t.from === step.id);
    const newEdges: Transition[] = [];
    for (const tOut of outgoing) {
      if (tOut.isLoop) {
        newEdges.push({ ...tOut, from: producer.id });
      } else {
        newEdges.push({
          from: producer.id,
          to: tOut.to,
          fromPort,
          toPort: tOut.toPort,
          isLoop: false,
          order: tOut.order,
        });
      }
    }
    const incomingLoops = transitions.filter(
      (t) => t.isLoop && t.to === step.id,
    );
    for (const tLoop of incomingLoops) {
      newEdges.push({ ...tLoop, to: producer.id });
    }

    removeStepAndItsTransitions(step.id);
    for (const edge of newEdges) {
      if (!transitions.some((t) => transitionEquals(t, edge))) {
        transitions.push(edge);
      }
    }
  }

  // Pass 2: variable.get → consumer.readsFrom
  for (const step of [...steps]) {
    if (step.kind !== "variable.get") continue;
    const varName = readVarName(step.config);
    if (!varName) {
      skipped.push({
        stepId: step.id,
        kind: "variable.get",
        reason: "missing-variable-name",
        message: `step ${step.id} (variable.get): missing config.variableName`,
      });
      continue;
    }

    const outgoingNonLoop = transitions.filter(
      (t) => !t.isLoop && t.from === step.id,
    );
    if (outgoingNonLoop.length === 0) {
      skipped.push({
        stepId: step.id,
        kind: "variable.get",
        reason: "no-outgoing-transition",
        message: `step ${step.id} (variable.get "${varName}"): no outgoing non-loop transition — cannot determine consumer`,
      });
      continue;
    }

    let downstreamMissing = false;
    for (const tOut of outgoingNonLoop) {
      const consumer = steps.find((s) => s.id === tOut.to);
      if (!consumer) {
        downstreamMissing = true;
        skipped.push({
          stepId: step.id,
          kind: "variable.get",
          reason: "downstream-not-found",
          message: `step ${step.id} (variable.get "${varName}"): downstream step ${tOut.to} not in template`,
        });
        break;
      }
    }
    if (downstreamMissing) continue;

    const incomingNonLoop = transitions.filter(
      (t) => !t.isLoop && t.to === step.id,
    );

    const newEdges: Transition[] = [];
    for (const tOut of outgoingNonLoop) {
      const consumer = steps.find((s) => s.id === tOut.to);
      if (!consumer) continue;
      const portName = tOut.toPort ?? "input";
      const nextReadsFrom = {
        ...(consumer.readsFrom ?? {}),
        [portName]: varName,
      };
      replaceStep(steps, consumer.id, { readsFrom: nextReadsFrom });

      for (const tIn of incomingNonLoop) {
        newEdges.push({
          from: tIn.from,
          to: consumer.id,
          fromPort: tIn.fromPort,
          toPort: tOut.toPort,
          isLoop: false,
          order: tOut.order,
        });
      }
    }

    removeStepAndItsTransitions(step.id);
    for (const edge of newEdges) {
      if (!transitions.some((t) => transitionEquals(t, edge))) {
        transitions.push(edge);
      }
    }
  }

  const migrated: WorkflowTemplate = {
    ...tpl,
    steps,
    transitions,
  };
  return { template: migrated, changed: true, skipped };
};
