/**
 * `workflow.call` — a **marker** step kind that references another template as
 * an inlined sub-workflow (`sub-template-expand.md` §1).
 *
 * Unlike a normal runner, its `run()` is **never** invoked: `flattenTemplate`
 * eliminates every `workflow.call` BEFORE the instance runs — the step does not
 * exist in the effective template. The runner only exists so the editor and
 * validation can derive the call's ports from the sub-template's interface
 * variables, and as a guard: if the orchestrator ever reaches `run()`, that is
 * a flattening bug.
 */
import type { NodeSpec, StepOutcome, StepRunner } from "../application/step-runner";
import type { WorkflowTemplate } from "../domain/template";
import { readWorkflowCallRef, WORKFLOW_CALL_KIND } from "../domain/services/flatten-template";

export type WorkflowCallRunnerDeps = {
  /**
   * Synchronous snapshot lookup of a referenced sub-template. `resolveSpec` is
   * pure/sync (the registry is async), so the composition root injects a cached
   * accessor. May return `undefined` when the snapshot has not seen the child
   * yet — the runner then degrades to an empty signature rather than throwing,
   * keeping the node pickable in the editor.
   */
  getChild?: (ref: { templateId: string; templateVersion: string }) => WorkflowTemplate | undefined;
};

export const createWorkflowCallRunner = (
  deps: WorkflowCallRunnerDeps = {},
): StepRunner => ({
  kind: WORKFLOW_CALL_KIND,

  resolveSpec({ config }): NodeSpec {
    const base: NodeSpec = {
      title: "Sub-workflow",
      description: "Inlines another template's graph at start (workflow.call).",
      inputs: [],
      outputs: [],
    };
    const id = config["templateId"];
    const version = config["templateVersion"];
    if (typeof id !== "string" || typeof version !== "string") return base;
    const child = deps.getChild?.({ templateId: id, templateVersion: version });
    if (!child) return base;
    // Ports are derived from the sub-template's interface variables: one input
    // port per `input` role, one output slot per `output` role.
    return {
      ...base,
      inputs: child.variables
        .filter((v) => v.role === "input")
        .map((v) => ({ name: v.name, kinds: [v.kind] })),
      outputs: child.variables
        .filter((v) => v.role === "output")
        .map((v) => ({ name: v.name, kind: v.kind })),
    };
  },

  async run(): Promise<StepOutcome> {
    throw new Error(
      "workflow.call must be flattened before execution — reaching run() is a flattening bug",
    );
  },
});
