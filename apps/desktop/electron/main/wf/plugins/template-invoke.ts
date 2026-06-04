/**
 * `template.invoke` — Approach A sub-template composition (`sub-template-invoke.md`).
 *
 * Unlike `workflow.call` (Approach B, which inlines the sub-template's graph at
 * start), a `template.invoke` step delegates to a **child instance**: at runtime
 * the orchestrator spawns an isolated instance of the referenced sub-template,
 * suspends this step in `awaitingChild`, and resumes it once the child reaches a
 * terminal state (§4/§5). The two mechanisms are distinct step kinds and share
 * only the `TemplateVariable.role` interface model.
 *
 * `run()` is intentionally inert: it returns the `spawned-child` outcome marker
 * and lets the orchestrator (which owns the event log) materialize the spawn.
 * Keeping the runner side-effect-free preserves testability — a runner only
 * declares an *intention*.
 */
import type { NodeSpec, StepOutcome, StepRunner, RunContext } from "../application/step-runner";
import type { WorkflowTemplate } from "../domain/template";
import { TEMPLATE_INVOKE_KIND } from "../domain/services/template-invoke";

export type TemplateInvokeRunnerDeps = {
  /**
   * Synchronous snapshot lookup of a referenced sub-template. `resolveSpec` is
   * pure/sync (the registry is async), so the composition root injects a cached
   * accessor — the same one `workflow.call` uses. May return `undefined` when
   * the snapshot has not seen the child yet; the runner then degrades to an
   * empty signature rather than throwing, keeping the node pickable in the
   * editor.
   */
  getChild?: (ref: { templateId: string; templateVersion: string }) => WorkflowTemplate | undefined;
};

export const createTemplateInvokeRunner = (
  deps: TemplateInvokeRunnerDeps = {},
): StepRunner => ({
  kind: TEMPLATE_INVOKE_KIND,

  /**
   * Dynamic signature: one input port per child `input` variable, one output
   * slot per child `output` variable (`sub-template-invoke.md` §2). Derived from
   * the referenced sub-template so the editor and `validateTemplatePorts` agree
   * on the same ports. The host wires these via the step's `readsFrom` /
   * `writesTo`, exactly like any other node.
   */
  resolveSpec({ config }): NodeSpec {
    const base: NodeSpec = {
      title: "Invoke sub-template",
      description: "Spawns a child instance of another template (template.invoke).",
      inputs: [],
      outputs: [],
    };
    const id = config["templateId"];
    const version = config["templateVersion"];
    if (typeof id !== "string" || typeof version !== "string") return base;
    const child = deps.getChild?.({ templateId: id, templateVersion: version });
    if (!child) return base;
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

  /**
   * No artifact is produced here — the runner hands the orchestrator a
   * `spawned-child` marker carrying the step config. The orchestrator resolves
   * the child template + seeds, emits `ChildInstanceSpawned` and the child's
   * `InstanceStarted`, and flips this step to `awaitingChild` (§5a).
   */
  async run(ctx: RunContext): Promise<StepOutcome> {
    return { kind: "spawned-child", config: ctx.step.config };
  },
});
