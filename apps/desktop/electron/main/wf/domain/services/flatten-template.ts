/**
 * `flattenTemplate` — the expansion pass at the heart of `sub-template-expand.md`
 * (approach B). It deplies (inlines) every `workflow.call` step of a template
 * into a single flat {@link WorkflowTemplate}, recursively, producing the
 * **effective template** the orchestrator runs against — unmodified.
 *
 * Pure domain service: `(root, resolve) → effective`. The only "IO" is the
 * injected synchronous `resolve` callback used to look up referenced
 * sub-templates (the caller pre-resolves the transitive closure). It detects
 * reference cycles and bounds the expansion depth.
 *
 * Invariant of the output (asserted by the caller via `validateTemplate` +
 * `inferIterationScopes`, see §2 / §8.7): the effective template contains **no**
 * `workflow.call` step and is structurally valid.
 */
import { asStepId, type StepId, type TemplateId, type TemplateVersion } from "../ids";
import type { StepDef, Transition, TemplateVariable, WorkflowTemplate } from "../template";

/** Step kind marking a sub-template call inlined by this pass. */
export const WORKFLOW_CALL_KIND = "workflow.call";

/** Default cap on how deep a chain of `workflow.call` may nest. */
export const MAX_EXPANSION_DEPTH = 8;

/** Reference a `workflow.call` points at — a literal, constant sub-template. */
export type WorkflowCallRef = {
  templateId: TemplateId;
  templateVersion: TemplateVersion;
};

/** Thrown when a template cannot be flattened (cycle, depth, malformed call). */
export class FlattenError extends Error {}

/**
 * Reads the `{ templateId, templateVersion }` reference out of a
 * `workflow.call` step's config. Throws {@link FlattenError} if absent — a
 * `workflow.call` with no literal ref cannot be expanded.
 */
export const readWorkflowCallRef = (step: StepDef): WorkflowCallRef => {
  const id = step.config["templateId"];
  const version = step.config["templateVersion"];
  if (typeof id !== "string" || typeof version !== "string") {
    throw new FlattenError(
      `workflow.call step "${step.id}" is missing a literal { templateId, templateVersion } config`,
    );
  }
  return { templateId: id as TemplateId, templateVersion: version as TemplateVersion };
};

const refKey = (ref: WorkflowCallRef): string => `${ref.templateId}@${ref.templateVersion}`;

/**
 * Returns a unique, `VARIABLE_NAME_RE`-valid name derived from a namespaced
 * step prefix + the original variable name. The step-id namespace separator
 * (`/`) is not legal in a variable name, so non-word chars are squashed to `_`;
 * uniqueness against `used` is then guaranteed by a numeric suffix.
 */
const namespacedVarName = (prefix: string, name: string, used: Set<string>): string => {
  let base = `${prefix}${name}`.replace(/[^a-zA-Z0-9_]/g, "_");
  if (!/^[a-zA-Z_]/.test(base)) base = `_${base}`;
  let candidate = base;
  let i = 1;
  while (used.has(candidate)) candidate = `${base}_${i++}`;
  used.add(candidate);
  return candidate;
};

/** Rewrites a `readsFrom` / `writesTo` slot→variable map through a rename table. */
const rewriteVarMap = (
  map: Readonly<Record<string, string>> | undefined,
  rename: ReadonlyMap<string, string>,
): Record<string, string> | undefined => {
  if (!map) return undefined;
  const out: Record<string, string> = {};
  for (const [slot, varName] of Object.entries(map)) {
    out[slot] = rename.get(varName) ?? varName;
  }
  return out;
};

/** Mutable working copy of a template while it is being assembled. */
type Working = {
  steps: StepDef[];
  transitions: Transition[];
  variables: TemplateVariable[];
  entryStep: StepId;
  exitSteps: StepId[];
  /** All variable names currently in use — guards namespacing uniqueness. */
  usedVarNames: Set<string>;
};

/**
 * Finds the namespaced exit step of `child` that produces the given output
 * variable (multi-exit routing, §4). Returns `undefined` when `outputVar` is
 * absent or no exit writes it — the caller falls back to the first exit.
 */
const findExitForOutput = (
  child: WorkflowTemplate,
  outputVar: string | undefined,
  prefix: string,
): StepId | undefined => {
  if (!outputVar) return undefined;
  for (const exitId of child.exitSteps) {
    const s = child.steps.find((x) => x.id === exitId);
    if (s?.writesTo && Object.values(s.writesTo).includes(outputVar)) {
      return asStepId(`${prefix}${exitId}`);
    }
  }
  return undefined;
};

/**
 * Inlines one already-flattened `child` (no remaining `workflow.call`) in place
 * of the `call` step, mutating `w`.
 */
const inlineCall = (w: Working, call: StepDef, child: WorkflowTemplate): void => {
  const prefix = `${call.id}/`;
  const nsStep = (id: StepId): StepId => asStepId(`${prefix}${id}`);

  // 1. Build the child-var → host-var rename table (§5). Interface variables
  //    bound through the call alias onto the host's local variables; everything
  //    else (internal, or an unbound interface var) becomes a private,
  //    namespaced variable added to the host.
  const rename = new Map<string, string>();
  for (const v of child.variables) {
    if (v.role === "input" && call.readsFrom?.[v.name] !== undefined) {
      rename.set(v.name, call.readsFrom[v.name]);
    } else if (v.role === "output" && call.writesTo?.[v.name] !== undefined) {
      rename.set(v.name, call.writesTo[v.name]);
    } else {
      const ns = namespacedVarName(prefix, v.name, w.usedVarNames);
      rename.set(v.name, ns);
      w.variables.push({ ...v, name: ns, role: "internal" });
    }
  }

  // 2. Namespace + rebind the child steps.
  const inlinedSteps = child.steps.map<StepDef>((s) => ({
    ...s,
    id: nsStep(s.id),
    readsFrom: rewriteVarMap(s.readsFrom, rename),
    writesTo: rewriteVarMap(s.writesTo, rename),
  }));

  // 3. Namespace the child's internal transitions. `scopeOf` is recomputed by
  //    `inferIterationScopes` on the effective template — never carried over.
  const inlinedTransitions = child.transitions.map<Transition>((t) => ({
    from: nsStep(t.from),
    fromPort: t.fromPort,
    toPort: t.toPort,
    to: nsStep(t.to),
    isLoop: t.isLoop,
    order: t.order,
  }));

  const childEntry = nsStep(child.entryStep);
  const childExits = child.exitSteps.map(nsStep);

  // 4. Rewire host edges touching the call. Data flows through the aliased
  //    variables (§5), so boundary edges are reduced to pure control wires
  //    (their ports are dropped). Incoming edges target the child entry;
  //    outgoing edges leave from the exit that produces the routed output var.
  const rewiredHost: Transition[] = [];
  for (const t of w.transitions) {
    if (t.from === call.id && t.to === call.id) continue;
    if (t.to === call.id) {
      rewiredHost.push({ from: t.from, to: childEntry, isLoop: t.isLoop, order: t.order });
    } else if (t.from === call.id) {
      const exit = findExitForOutput(child, t.fromPort, prefix) ?? childExits[0];
      rewiredHost.push({ from: exit, to: t.to, isLoop: t.isLoop, order: t.order });
    } else {
      rewiredHost.push(t);
    }
  }

  // 5. Splice: drop the call step, add the inlined sub-graph.
  w.steps = w.steps.filter((s) => s.id !== call.id).concat(inlinedSteps);
  w.transitions = rewiredHost.concat(inlinedTransitions);
  if (w.entryStep === call.id) w.entryStep = childEntry;
  w.exitSteps = w.exitSteps.flatMap((e) => (e === call.id ? childExits : [e]));
};

/**
 * Recursively flattens `tpl` into a working copy with no `workflow.call` steps.
 *
 * @param chain Template ids currently being expanded along this path — used to
 *              detect reference cycles (`A → B → A`).
 * @param depth Expansion depth of `tpl` from the root (root = 0).
 */
const flattenInto = (
  tpl: WorkflowTemplate,
  resolve: (ref: WorkflowCallRef) => WorkflowTemplate,
  chain: ReadonlyArray<TemplateId>,
  depth: number,
  maxDepth: number,
): WorkflowTemplate => {
  const calls = tpl.steps.filter((s) => s.kind === WORKFLOW_CALL_KIND);
  if (calls.length === 0) return tpl;

  const w: Working = {
    steps: [...tpl.steps],
    transitions: [...tpl.transitions],
    variables: [...tpl.variables],
    entryStep: tpl.entryStep,
    exitSteps: [...tpl.exitSteps],
    usedVarNames: new Set(tpl.variables.map((v) => v.name)),
  };

  for (const call of calls) {
    const ref = readWorkflowCallRef(call);
    if (chain.includes(ref.templateId)) {
      const cycle = [...chain, ref.templateId].join(" → ");
      throw new FlattenError(`workflow.call reference cycle detected: ${cycle}`);
    }
    if (depth + 1 > maxDepth) {
      const cliff = [...chain, ref.templateId].join(" → ");
      throw new FlattenError(
        `workflow.call expansion exceeds MAX_EXPANSION_DEPTH (${maxDepth}): ${cliff}`,
      );
    }
    const childRaw = resolve(ref);
    const child = flattenInto(childRaw, resolve, [...chain, ref.templateId], depth + 1, maxDepth);
    inlineCall(w, call, child);
  }

  return {
    ...tpl,
    entryStep: w.entryStep,
    exitSteps: w.exitSteps,
    steps: w.steps,
    transitions: w.transitions,
    variables: w.variables,
  };
};

/**
 * Deplies every `workflow.call` of `root` into a single flat
 * {@link WorkflowTemplate}. When `root` contains no `workflow.call`, returns
 * `root` unchanged (identity — the caller skips pinning an effective template).
 *
 * @throws {FlattenError} on a reference cycle or when the expansion depth
 *         exceeds `maxDepth` (default {@link MAX_EXPANSION_DEPTH}).
 */
export const flattenTemplate = (
  root: WorkflowTemplate,
  resolve: (ref: WorkflowCallRef) => WorkflowTemplate,
  opts?: { maxDepth?: number },
): WorkflowTemplate =>
  flattenInto(root, resolve, [root.id], 0, opts?.maxDepth ?? MAX_EXPANSION_DEPTH);

/** True when `tpl` has at least one `workflow.call` step needing expansion. */
export const hasWorkflowCall = (tpl: WorkflowTemplate): boolean =>
  tpl.steps.some((s) => s.kind === WORKFLOW_CALL_KIND);
