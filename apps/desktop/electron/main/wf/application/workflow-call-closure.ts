/**
 * Shared resolution of a template's `workflow.call` closure into a synchronous
 * snapshot. The expansion (`flattenTemplate`) and interface validation
 * (`validateWorkflowCalls`) are pure and synchronous, but the registry is async
 * — so both `save-template` and `start-instance` first pre-resolve the
 * transitive set of referenced sub-templates here, then run the pure passes
 * over the snapshot. Keeping this in one place stops the two call sites from
 * drifting apart (`sub-template-expand.md` §2/§8).
 */
import type { TemplateRegistry } from "./ports/outbound/template-registry";
import type { WorkflowTemplate } from "../domain/template";
import {
  readWorkflowCallRef,
  WORKFLOW_CALL_KIND,
  type WorkflowCallRef,
} from "../domain/services/flatten-template";

export const refKey = (ref: WorkflowCallRef): string =>
  `${ref.templateId}@${ref.templateVersion}`;

/**
 * Pre-resolves, breadth-first, every sub-template transitively referenced by a
 * `workflow.call` in `root`, keyed by `id@version`. `root` itself is not added.
 * Throws if a ref cannot be resolved from the registry.
 */
export const buildWorkflowCallSnapshot = async (
  templates: TemplateRegistry,
  root: WorkflowTemplate,
): Promise<Map<string, WorkflowTemplate>> => {
  const snapshot = new Map<string, WorkflowTemplate>();
  const queue: WorkflowTemplate[] = [root];
  while (queue.length > 0) {
    const tpl = queue.shift()!;
    for (const step of tpl.steps) {
      if (step.kind !== WORKFLOW_CALL_KIND) continue;
      const ref = readWorkflowCallRef(step);
      const key = refKey(ref);
      if (snapshot.has(key)) continue;
      const child = await templates.resolve(ref.templateId, ref.templateVersion);
      snapshot.set(key, child);
      queue.push(child);
    }
  }
  return snapshot;
};

/** A synchronous resolver over a pre-built snapshot (`undefined` on a miss). */
export const snapshotResolve =
  (snapshot: ReadonlyMap<string, WorkflowTemplate>) =>
  (ref: WorkflowCallRef): WorkflowTemplate | undefined =>
    snapshot.get(refKey(ref));
