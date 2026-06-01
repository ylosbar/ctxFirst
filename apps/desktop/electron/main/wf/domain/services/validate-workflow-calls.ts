/**
 * `validateWorkflowCalls` — the save-time / start-time guard for `workflow.call`
 * steps (`sub-template-expand.md` §8). Complements `flattenTemplate` (which only
 * runs the structural expansion) with the interface-level rules a caller cannot
 * express purely from the graph:
 *
 *  1. literal `{ templateId, templateVersion }` present, pointing at a
 *     `published` sub-template;
 *  2. the sub-template is invocable (has at least one `input`/`output`
 *     variable) — unless the call is tagged `passThrough`, in which case an
 *     interface-less sub-template is inlined as a side-effect sub-routine, and a
 *     sub-template that *does* expose an interface is rejected
 *     (`sub-workflow-passthrough.md`);
 *  3. `readsFrom` covers **every** `input` variable, and `writesTo` covers every
 *     `output` consumed by an outgoing edge of the call;
 *  4. each binding is kind-compatible (`portAccepts`);
 *  5. no reference cycle (`A → B → A`);
 *  6. expansion depth ≤ `MAX_EXPANSION_DEPTH`;
 *  7. the flattened effective template still passes `validateTemplate` +
 *     `inferIterationScopes` — and a scope violation (§9) is reported against
 *     the offending `workflow.call` by its namespaced prefix.
 *
 * Rules 5–7 are obtained by reusing {@link flattenTemplate} + the structural
 * validators; rules 1–4 are checked here per call across the closure.
 *
 * Pure domain service: it takes a **synchronous** `resolve` (the caller
 * pre-resolves the transitive closure from the async registry) and throws
 * {@link WorkflowCallError} on the first violation. Reused by both
 * `save-template` and `start-instance` so the two paths agree (§8: "vérifié au
 * save ET au start").
 */
import { portAccepts, type RefinementParentResolver } from "@shared/wf/port-accepts";
import {
  validateTemplate,
  type StepDef,
  type TemplateVariable,
  type WorkflowTemplate,
} from "../template";
import {
  inferIterationScopes,
  IterationScopeError,
} from "./iteration-scopes";
import {
  flattenTemplate,
  FlattenError,
  MAX_EXPANSION_DEPTH,
  readWorkflowCallRef,
  WORKFLOW_CALL_KIND,
  type WorkflowCallRef,
} from "./flatten-template";

/** Thrown when a `workflow.call` step is misconfigured or composes illegally. */
export class WorkflowCallError extends Error {}

const refKey = (ref: WorkflowCallRef): string => `${ref.templateId}@${ref.templateVersion}`;

const interfaceVars = (
  tpl: WorkflowTemplate,
  role: "input" | "output",
): ReadonlyArray<TemplateVariable> => tpl.variables.filter((v) => v.role === role);

/**
 * Validates the interface bindings of a single `workflow.call` step `call`
 * declared in host template `host`, against its resolved sub-template `child`.
 * Covers rules 1–4.
 */
const validateCallBindings = (
  host: WorkflowTemplate,
  call: StepDef,
  child: WorkflowTemplate,
  resolver: RefinementParentResolver | undefined,
): void => {
  // Rule 1 (published): the literal ref was already read; the child it resolves
  // to must be a published template — drafts are not safe to inline.
  if (child.status !== "published") {
    throw new WorkflowCallError(
      `workflow.call "${call.id}" references ${child.id}@${child.version}, which is not published`,
    );
  }

  const inputs = interfaceVars(child, "input");
  const outputs = interfaceVars(child, "output");

  // `passThrough` (`sub-workflow-passthrough.md`) relaxes rule 2: an explicitly
  // tagged call may inline an interface-less sub-template as a pure side-effect
  // sub-routine, wired by control flow only.
  const passThrough = call.config["passThrough"] === true;

  // Rule 2: the sub-template must expose an interface to be invocable — unless
  // the call is explicitly marked passThrough. Without the flag, the historic
  // error stands (the interface was probably forgotten).
  if (inputs.length === 0 && outputs.length === 0 && !passThrough) {
    throw new WorkflowCallError(
      `workflow.call "${call.id}" references ${child.id}@${child.version}, which is not invocable ` +
        `(no input/output variable — tag its interface, or set passThrough: true to inline it as a side-effect sub-routine)`,
    );
  }

  // The passThrough contract is "zero data exchanged": leaving an interface
  // unbound would silently drop ports, so a passThrough call over a template
  // that *does* expose an interface is rejected.
  if (passThrough && (inputs.length > 0 || outputs.length > 0)) {
    throw new WorkflowCallError(
      `workflow.call "${call.id}" is marked passThrough but ${child.id} exposes an interface ` +
        `(${inputs.length} input(s), ${outputs.length} output(s)) — unset passThrough and bind them, or remove the interface`,
    );
  }

  const hostVarByName = new Map(host.variables.map((v) => [v.name, v]));
  const readsFrom = call.readsFrom ?? {};
  const writesTo = call.writesTo ?? {};

  // Rule 3 (inputs): every `input` variable of the child must be bound.
  for (const vi of inputs) {
    const hostVarName = readsFrom[vi.name];
    if (hostVarName === undefined) {
      throw new WorkflowCallError(
        `workflow.call "${call.id}" must bind input "${vi.name}" of ${child.id} (add it to readsFrom)`,
      );
    }
    const hostVar = hostVarByName.get(hostVarName);
    if (!hostVar) {
      throw new WorkflowCallError(
        `workflow.call "${call.id}" binds input "${vi.name}" to variable "${hostVarName}", which is not declared on ${host.id}`,
      );
    }
    // Rule 4: the child input port (kind vi.kind) must accept the host var.
    if (!portAccepts({ kinds: [vi.kind] }, hostVar.kind, resolver)) {
      throw new WorkflowCallError(
        `workflow.call "${call.id}" input "${vi.name}" expects ${vi.kind} but is bound to "${hostVarName}" (${hostVar.kind})`,
      );
    }
  }

  // Rule 3 (outputs): every `output` consumed by an outgoing edge of the call
  // must be bound, so the downstream host step has a variable to read.
  const consumedOutputPorts = new Set(
    host.transitions
      .filter((t) => t.from === call.id && t.fromPort)
      .map((t) => t.fromPort as string),
  );
  for (const vo of outputs) {
    const hostVarName = writesTo[vo.name];
    if (hostVarName === undefined) {
      if (consumedOutputPorts.has(vo.name)) {
        throw new WorkflowCallError(
          `workflow.call "${call.id}" output "${vo.name}" of ${child.id} is consumed downstream but not bound (add it to writesTo)`,
        );
      }
      continue; // unbound + unconsumed → becomes a private namespaced variable
    }
    const hostVar = hostVarByName.get(hostVarName);
    if (!hostVar) {
      throw new WorkflowCallError(
        `workflow.call "${call.id}" binds output "${vo.name}" to variable "${hostVarName}", which is not declared on ${host.id}`,
      );
    }
    // Rule 4: the host var (kind hostVar.kind) must accept the child output.
    if (!portAccepts({ kinds: [hostVar.kind] }, vo.kind, resolver)) {
      throw new WorkflowCallError(
        `workflow.call "${call.id}" output "${vo.name}" produces ${vo.kind} but is bound to "${hostVarName}" (${hostVar.kind})`,
      );
    }
  }
};

/**
 * Validates every `workflow.call` reachable from `root` (rules 1–7).
 *
 * @param root     the template being saved/started.
 * @param resolve  synchronous lookup of a sub-template; `undefined` ⇒ the ref
 *                 could not be resolved (unknown id/version).
 * @throws {WorkflowCallError} on any interface or composition violation.
 */
export const validateWorkflowCalls = (
  root: WorkflowTemplate,
  resolve: (ref: WorkflowCallRef) => WorkflowTemplate | undefined,
  opts?: { resolver?: RefinementParentResolver; maxDepth?: number },
): void => {
  const resolver = opts?.resolver;
  const maxDepth = opts?.maxDepth ?? MAX_EXPANSION_DEPTH;

  // Walk the closure breadth-first, validating each template's calls against
  // their resolved children (rules 1–4). Nested calls are validated against the
  // template that declares them, so binding errors keep their local context.
  const seen = new Set<string>();
  const queue: WorkflowTemplate[] = [root];
  seen.add(refKey({ templateId: root.id, templateVersion: root.version }));
  while (queue.length > 0) {
    const host = queue.shift()!;
    for (const step of host.steps) {
      if (step.kind !== WORKFLOW_CALL_KIND) continue;
      // Rule 1 (literal present): readWorkflowCallRef throws FlattenError when
      // the config lacks a literal { templateId, templateVersion }.
      let ref: WorkflowCallRef;
      try {
        ref = readWorkflowCallRef(step);
      } catch (err) {
        throw new WorkflowCallError(
          err instanceof Error ? err.message : String(err),
        );
      }
      const child = resolve(ref);
      if (!child) {
        throw new WorkflowCallError(
          `workflow.call "${step.id}" references ${refKey(ref)}, which could not be resolved`,
        );
      }
      validateCallBindings(host, step, child, resolver);
      const key = refKey(ref);
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(child);
      }
    }
  }

  // Rules 5 & 6: cycle + depth are detected by the expansion pass itself.
  const resolveOrThrow = (ref: WorkflowCallRef): WorkflowTemplate => {
    const child = resolve(ref);
    if (!child) {
      throw new WorkflowCallError(
        `workflow.call references ${refKey(ref)}, which could not be resolved`,
      );
    }
    return child;
  };
  let effective: WorkflowTemplate;
  try {
    effective = flattenTemplate(root, resolveOrThrow, { maxDepth });
  } catch (err) {
    if (err instanceof FlattenError) throw new WorkflowCallError(err.message);
    throw err;
  }

  // Rule 7: the composed graph must still be structurally valid. A scope
  // violation (§9) is reported against the originating workflow.call via the
  // namespaced prefix of the offending step id.
  validateTemplate(effective);
  try {
    inferIterationScopes(effective);
  } catch (err) {
    if (err instanceof IterationScopeError) {
      throw new WorkflowCallError(decorateScopeError(err));
    }
    throw err;
  }
};

/**
 * Rewrites an iteration-scope error raised on the flattened graph so the author
 * sees **which** `workflow.call` caused the illegal nesting. Flattened step ids
 * carry the call prefix (`c/inner` ← call `c`), so the leading segment names the
 * culprit. When the cited id is host-local (no prefix), the original message is
 * already meaningful and returned unchanged.
 */
const decorateScopeError = (err: IterationScopeError): string => {
  const cited = /\b([A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+)\b/.exec(err.message);
  if (!cited) return `${err.code}: ${err.message}`;
  const call = cited[1].split("/")[0];
  return (
    `${err.code}: ${err.message} — caused by workflow.call "${call}": its sub-template ` +
    `contains a foreach/branch that cannot be nested inside a host foreach scope ` +
    `(use template.invoke / approach A for nested iteration, sub-template-expand.md §9)`
  );
};
