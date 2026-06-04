/**
 * `validateTemplateInvokes` — the save-time / start-time guard for
 * `template.invoke` steps (`sub-template-invoke.md` §10/§14). Sibling of
 * `validate-workflow-calls.ts`, but for Approach A (child-instance spawn). Since
 * `template.invoke` does **not** flatten the sub-template into the host graph,
 * cycle and depth are walked here directly over the reference graph rather than
 * obtained as a side-effect of expansion.
 *
 * Rules (per `template.invoke` step, against its resolved sub-template `child`):
 *  1. literal `{ templateId, templateVersion }` present, pointing at a
 *     `published` sub-template;
 *  2. `child` is invocable — at least one `input` or `output` variable;
 *  3. interface coherence inside `child`: every `input` variable is read by a
 *     step reachable from the entry; every `output` variable is written by a
 *     step that can reach an exit;
 *  4. host mapping exhaustiveness: the call's `readsFrom` binds **every** `input`
 *     variable of `child` (outputs are optional — the host may ignore some);
 *  5. no reference cycle (`A → … → A`);
 *  6. `templateId` is a literal in config (enforced by `readTemplateInvokeRef`);
 *  7. each binding is kind-compatible (`portAccepts`).
 *
 * Plus §14: the invocation tree's max depth must not exceed `maxDepth`.
 *
 * Pure domain service: it takes a **synchronous** `resolve` (the caller
 * pre-resolves the transitive closure from the async registry) and throws
 * {@link TemplateInvokeError} on the first violation. Reused by both
 * `save-template` and `start-instance` so the two paths agree.
 */
import { portAccepts, type RefinementParentResolver } from "@shared/wf/port-accepts";
import type { StepId } from "../ids";
import {
  type StepDef,
  type TemplateVariable,
  type WorkflowTemplate,
} from "../template";
import { isExit, successors } from "./transition-policy";
import {
  isTemplateInvoke,
  MAX_INVOCATION_DEPTH,
  readTemplateInvokeRef,
  TemplateInvokeError,
  templateInvokeRefKey,
  type TemplateInvokeRef,
} from "./template-invoke";

const interfaceVars = (
  tpl: WorkflowTemplate,
  role: "input" | "output",
): ReadonlyArray<TemplateVariable> => tpl.variables.filter((v) => v.role === role);

/** Steps reachable from the entry via non-loop edges (forward closure). */
const stepsReachableFromEntry = (tpl: WorkflowTemplate): Set<StepId> => {
  const seen = new Set<StepId>();
  const queue: StepId[] = [tpl.entryStep];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const edge of successors(tpl, cur)) queue.push(edge.to);
  }
  return seen;
};

/** Steps that can reach some exit via non-loop edges (backward closure). */
const stepsThatReachAnExit = (tpl: WorkflowTemplate): Set<StepId> => {
  const reverse = new Map<StepId, StepId[]>();
  for (const t of tpl.transitions) {
    if (t.isLoop) continue;
    const list = reverse.get(t.to) ?? [];
    list.push(t.from);
    reverse.set(t.to, list);
  }
  const seen = new Set<StepId>();
  const queue: StepId[] = tpl.steps
    .map((s) => s.id)
    .filter((id) => isExit(tpl, id));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const from of reverse.get(cur) ?? []) queue.push(from);
  }
  return seen;
};

/**
 * Validates the interface coherence of a sub-template `child` (rule 3): each
 * `input` must be read by a reachable step, each `output` written by a step that
 * can reach an exit. Catches a sub-template whose declared interface is never
 * wired — invoking it would silently do nothing.
 */
const validateChildInterfaceCoherence = (child: WorkflowTemplate): void => {
  const reachable = stepsReachableFromEntry(child);
  const toExit = stepsThatReachAnExit(child);

  for (const vi of interfaceVars(child, "input")) {
    const read = child.steps.some(
      (s) =>
        reachable.has(s.id) &&
        Object.values(s.readsFrom ?? {}).includes(vi.name),
    );
    if (!read) {
      throw new TemplateInvokeError(
        `sub-template ${child.id}@${child.version} declares input "${vi.name}" but no step reachable from the entry reads it (readsFrom)`,
      );
    }
  }
  for (const vo of interfaceVars(child, "output")) {
    const written = child.steps.some(
      (s) =>
        toExit.has(s.id) &&
        Object.values(s.writesTo ?? {}).includes(vo.name),
    );
    if (!written) {
      throw new TemplateInvokeError(
        `sub-template ${child.id}@${child.version} declares output "${vo.name}" but no exit-reaching step writes it (writesTo)`,
      );
    }
  }
};

/** Validates rules 1–4, 7 for a single `template.invoke` step in `host`. */
const validateInvokeBindings = (
  host: WorkflowTemplate,
  invoke: StepDef,
  child: WorkflowTemplate,
  resolver: RefinementParentResolver | undefined,
): void => {
  // Rule 1 (published).
  if (child.status !== "published") {
    throw new TemplateInvokeError(
      `template.invoke "${invoke.id}" references ${child.id}@${child.version}, which is not published`,
    );
  }

  const inputs = interfaceVars(child, "input");
  const outputs = interfaceVars(child, "output");

  // Rule 2 (invocable): a black-box sub-template with no interface would be a
  // call that exchanges no data — reject it.
  if (inputs.length === 0 && outputs.length === 0) {
    throw new TemplateInvokeError(
      `template.invoke "${invoke.id}" references ${child.id}@${child.version}, which is not invocable ` +
        `(no input/output variable — tag its interface in the Variables panel)`,
    );
  }

  // Rule 3 (interface coherence of the child).
  validateChildInterfaceCoherence(child);

  const hostVarByName = new Map(host.variables.map((v) => [v.name, v]));
  const readsFrom = invoke.readsFrom ?? {};
  const writesTo = invoke.writesTo ?? {};

  // Rule 4 (inputs): every `input` variable of the child must be bound.
  for (const vi of inputs) {
    const hostVarName = readsFrom[vi.name];
    if (hostVarName === undefined) {
      throw new TemplateInvokeError(
        `template.invoke "${invoke.id}" must bind input "${vi.name}" of ${child.id} (add it to readsFrom)`,
      );
    }
    const hostVar = hostVarByName.get(hostVarName);
    if (!hostVar) {
      throw new TemplateInvokeError(
        `template.invoke "${invoke.id}" binds input "${vi.name}" to variable "${hostVarName}", which is not declared on ${host.id}`,
      );
    }
    // Rule 7: the child input port (kind vi.kind) must accept the host var.
    if (!portAccepts({ kinds: [vi.kind] }, hostVar.kind, resolver)) {
      throw new TemplateInvokeError(
        `template.invoke "${invoke.id}" input "${vi.name}" expects ${vi.kind} but is bound to "${hostVarName}" (${hostVar.kind})`,
      );
    }
  }

  // Rule 4 (outputs): a bound output must reference a declared host variable and
  // be kind-compatible. Unbound outputs are tolerated (the host may ignore them).
  for (const vo of outputs) {
    const hostVarName = writesTo[vo.name];
    if (hostVarName === undefined) continue;
    const hostVar = hostVarByName.get(hostVarName);
    if (!hostVar) {
      throw new TemplateInvokeError(
        `template.invoke "${invoke.id}" binds output "${vo.name}" to variable "${hostVarName}", which is not declared on ${host.id}`,
      );
    }
    if (!portAccepts({ kinds: [hostVar.kind] }, vo.kind, resolver)) {
      throw new TemplateInvokeError(
        `template.invoke "${invoke.id}" output "${vo.name}" produces ${vo.kind} but is bound to "${hostVarName}" (${hostVar.kind})`,
      );
    }
  }
};

/**
 * Validates every `template.invoke` reachable from `root` (rules 1–7) and the
 * §14 depth bound. `resolve` is a synchronous lookup of a sub-template
 * (`undefined` ⇒ unresolved ref).
 *
 * @throws {TemplateInvokeError} on any interface, cycle, or depth violation.
 */
export const validateTemplateInvokes = (
  root: WorkflowTemplate,
  resolve: (ref: TemplateInvokeRef) => WorkflowTemplate | undefined,
  opts?: { resolver?: RefinementParentResolver; maxDepth?: number },
): void => {
  const resolver = opts?.resolver;
  const maxDepth = opts?.maxDepth ?? MAX_INVOCATION_DEPTH;

  // (a) Per-step binding validation across the closure (rules 1–4, 7), each
  // call validated against the template that declares it so errors keep their
  // local context.
  const validated = new Set<string>();
  const queue: WorkflowTemplate[] = [root];
  validated.add(templateInvokeRefKey({ templateId: root.id, templateVersion: root.version }));
  while (queue.length > 0) {
    const host = queue.shift()!;
    for (const step of host.steps) {
      if (!isTemplateInvoke(step)) continue;
      // Rule 1/6 (literal present): throws TemplateInvokeError on absence.
      const ref = readTemplateInvokeRef(step);
      const child = resolve(ref);
      if (!child) {
        throw new TemplateInvokeError(
          `template.invoke "${step.id}" references ${templateInvokeRefKey(ref)}, which could not be resolved`,
        );
      }
      validateInvokeBindings(host, step, child, resolver);
      const key = templateInvokeRefKey(ref);
      if (!validated.has(key)) {
        validated.add(key);
        queue.push(child);
      }
    }
  }

  // (b) Rule 5 (cycle) + §14 (depth): DFS over the reference graph. `stack`
  // holds the current chain `id@version` keys to detect a back edge; `depth`
  // is the longest acyclic chain from `root` (root = 0).
  const chain: string[] = [];
  const dfs = (tpl: WorkflowTemplate, depth: number): void => {
    const key = templateInvokeRefKey({ templateId: tpl.id, templateVersion: tpl.version });
    if (chain.includes(key)) {
      throw new TemplateInvokeError(
        `template.invoke cycle detected: ${[...chain, key].join(" → ")}`,
      );
    }
    if (depth > maxDepth) {
      throw new TemplateInvokeError(
        `template.invoke chain exceeds max depth ${maxDepth}: ${[...chain, key].join(" → ")}`,
      );
    }
    chain.push(key);
    for (const step of tpl.steps) {
      if (!isTemplateInvoke(step)) continue;
      const ref = readTemplateInvokeRef(step);
      const child = resolve(ref);
      if (!child) {
        throw new TemplateInvokeError(
          `template.invoke "${step.id}" references ${templateInvokeRefKey(ref)}, which could not be resolved`,
        );
      }
      dfs(child, depth + 1);
    }
    chain.pop();
  };
  dfs(root, 0);
};
