/**
 * Compat shim for the `shell.exec` multi-output rework
 * (cf. `specs/shell-exec-multi-output.md` §Migration). The runner used to
 * expose a single `report` output; it now branches across four ports
 * (`success`, `failure`, `stdout`, `stderr`). A persisted template whose edge
 * leaves a `shell.exec` step via the old `report` port (or via the bare
 * single-output default with no `fromPort`) would otherwise raise a
 * `runner-shape-mismatch` at run time.
 *
 * Rewrite: every non-loop transition leaving a `shell.exec` step through the
 * legacy `report` port — or carrying no `fromPort` at all (the old node had a
 * single output, so an unqualified edge unambiguously meant `report`) — is
 * duplicated into two transitions, one on `success` and one on `failure`,
 * preserving the "the downstream always runs" behaviour. All other fields
 * (`to`, `toPort`, `order`) are kept.
 *
 * Applied at load time by the template registry; idempotent — after a first
 * pass no `shell.exec` edge carries `report` / an empty `fromPort`, so a
 * second pass is a no-op.
 */
import type { StepId } from "../../domain/ids";
import type { Transition, WorkflowTemplate } from "../../domain/template";

const LEGACY_PORT = "report";
const NEW_PORTS = ["success", "failure"] as const;

const transitionEquals = (a: Transition, b: Transition): boolean =>
  a.from === b.from &&
  a.to === b.to &&
  a.isLoop === b.isLoop &&
  (a.fromPort ?? null) === (b.fromPort ?? null) &&
  (a.toPort ?? null) === (b.toPort ?? null) &&
  (a.order ?? null) === (b.order ?? null);

export type MigrationResult = {
  template: WorkflowTemplate;
  changed: boolean;
};

/** True for an edge leaving a `shell.exec` step via the legacy single output. */
const isLegacyShellExecEdge = (
  t: Transition,
  shellExecIds: ReadonlySet<StepId>,
): boolean => {
  if (t.isLoop) return false;
  if (!shellExecIds.has(t.from)) return false;
  const port = t.fromPort ?? "";
  return port === LEGACY_PORT || port === "";
};

export const migrateShellExecReportPort = (
  tpl: WorkflowTemplate,
): MigrationResult => {
  const shellExecIds = new Set<StepId>(
    tpl.steps.filter((s) => s.kind === "shell.exec").map((s) => s.id),
  );
  if (shellExecIds.size === 0) {
    return { template: tpl, changed: false };
  }

  const next: Transition[] = [];
  let changed = false;
  for (const t of tpl.transitions) {
    if (!isLegacyShellExecEdge(t, shellExecIds)) {
      next.push(t);
      continue;
    }
    for (const port of NEW_PORTS) {
      const rewritten: Transition = { ...t, fromPort: port };
      // Idempotency / safety: never introduce a duplicate of an edge that is
      // already present (e.g. a partially migrated template).
      if (next.some((x) => transitionEquals(x, rewritten))) continue;
      if (tpl.transitions.some((x) => transitionEquals(x, rewritten))) continue;
      next.push(rewritten);
    }
    changed = true;
  }

  if (!changed) {
    return { template: tpl, changed: false };
  }
  return { template: { ...tpl, transitions: next }, changed: true };
};
