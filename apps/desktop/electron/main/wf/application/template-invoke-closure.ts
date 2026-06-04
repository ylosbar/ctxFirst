/**
 * Pre-resolves the transitive set of sub-templates a run reaches through
 * `template.invoke` steps, into a synchronous snapshot frozen at root-instance
 * start (`sub-template-invoke.md` §7). Republishing a sub-template mid-run must
 * not swap versions under a live instance; spawned children inherit this
 * snapshot rather than re-resolving the registry.
 *
 * Sibling of `workflow-call-closure.ts` — same BFS shape, but for Approach A
 * (child-instance spawn) instead of Approach B (graph inlining). The two are
 * independent: a template may use either, both, or neither.
 *
 * **Phase A:** no template carries a `template.invoke` step yet (no runner is
 * registered), so this BFS visits zero steps and returns an empty map for every
 * current run. It exists so `start-instance` can persist the snapshot from day
 * one; the runner that makes it non-empty lands in Phase B.
 */
import type { TemplateRegistry } from "./ports/outbound/template-registry";
import type { WorkflowTemplate } from "../domain/template";
import {
  isTemplateInvoke,
  readTemplateInvokeRef,
  templateInvokeRefKey,
} from "../domain/services/template-invoke";

/**
 * Pre-resolves, breadth-first, every sub-template transitively referenced by a
 * `template.invoke` step in `root`, keyed by `id@version`. `root` itself is not
 * added. A repeated ref (incl. a cycle) is visited once — the dedup guarantees
 * termination; cycle/depth *rejection* is a separate validation concern (§14).
 * Throws if a ref cannot be resolved from the registry.
 */
export const buildTemplateInvokeSnapshot = async (
  templates: TemplateRegistry,
  root: WorkflowTemplate,
): Promise<Map<string, WorkflowTemplate>> => {
  const snapshot = new Map<string, WorkflowTemplate>();
  const queue: WorkflowTemplate[] = [root];
  while (queue.length > 0) {
    const tpl = queue.shift()!;
    for (const step of tpl.steps) {
      if (!isTemplateInvoke(step)) continue;
      const ref = readTemplateInvokeRef(step);
      const key = templateInvokeRefKey(ref);
      if (snapshot.has(key)) continue;
      const child = await templates.resolve(ref.templateId, ref.templateVersion);
      snapshot.set(key, child);
      queue.push(child);
    }
  }
  return snapshot;
};
