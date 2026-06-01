/**
 * Use-case: create a new {@link WorkflowInstance} from a template reference
 * and a set of seed artifacts.
 *
 * Returns as soon as `InstanceStarted` is persisted and published. The
 * orchestrator picks up the event asynchronously to drive the first step.
 */
import type { ArtifactStore } from "../ports/outbound/artifact-store";
import type { ChannelContext } from "../ports/outbound/channel-context";
import type { ClockPort } from "../ports/outbound/clock";
import type { EventBus } from "../ports/outbound/event-bus";
import type { EventLog } from "../ports/outbound/event-log";
import type { IdGenerator } from "../ports/outbound/id-generator";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { DomainEvent } from "../../domain/events";
import {
  asArtifactId,
  asEventId,
  asWorkflowId,
  type ArtifactId,
  type WorkflowId,
} from "../../domain/ids";
import type { ArtifactKind } from "../../domain/artifact";
import { validateTemplate, type WorkflowTemplate } from "../../domain/template";
import { inferIterationScopes } from "../../domain/services/iteration-scopes";
import {
  flattenTemplate,
  hasWorkflowCall,
} from "../../domain/services/flatten-template";
import { validateWorkflowCalls } from "../../domain/services/validate-workflow-calls";
import {
  buildWorkflowCallSnapshot,
  snapshotResolve,
} from "../workflow-call-closure";

type Deps = {
  templates: TemplateRegistry;
  artifactStore: ArtifactStore;
  bus: EventBus;
  log: EventLog;
  clock: ClockPort;
  ids: IdGenerator;
  channels: ChannelContext;
};

/** Input to {@link StartInstance}. */
export type StartInstanceInput = {
  /** Canonical `name@version` reference of the template. */
  templateRef: string;
  /** Initial inputs for the first step (e.g. a pasted Markdown spec). */
  seeds: ReadonlyArray<{ kind: ArtifactKind; content: string }>;
  /**
   * Initial working directory for native side-effects of the run (currently
   * the cwd of the spawned Claude CLI). Mutable later via `workspace.set`.
   */
  cwd?: string;
  /**
   * Force the channel the produced run will be attached to. When omitted (UI
   * path), falls back to the currently-active channel. The scheduler service
   * uses this to bind a scheduled run to its schedule's channel — a cron
   * fires in the background and must not pick up whatever channel the user
   * happens to be looking at.
   */
  channelId?: string;
};

/** Command type returned by {@link makeStartInstance}. */
export type StartInstance = (input: StartInstanceInput) => Promise<{ instanceId: WorkflowId }>;

/**
 * Flattens every `workflow.call` of `root` into the effective template the
 * instance will run against (`sub-template-expand.md` §2/§6). Pre-resolves the
 * **transitive closure** of referenced sub-templates from the registry (async),
 * then runs the pure `flattenTemplate` pass over a synchronous snapshot. Returns
 * `undefined` when `root` has no `workflow.call` (the instance runs against the
 * registry template by ref, unchanged). Fails fast — the interface bindings
 * (`validateWorkflowCalls`, §8) and the flattened graph
 * (`validateTemplate` + `inferIterationScopes`) are re-checked here so a
 * sub-template republished after save can't start an invalid run.
 */
const resolveEffectiveTemplate = async (
  templates: TemplateRegistry,
  root: WorkflowTemplate,
): Promise<WorkflowTemplate | undefined> => {
  if (!hasWorkflowCall(root)) return undefined;

  const snapshot = await buildWorkflowCallSnapshot(templates, root);
  const resolve = snapshotResolve(snapshot);

  // §8: re-validate interface bindings, cycle, depth and composed-graph
  // validity at start (the registry may have moved since save).
  validateWorkflowCalls(root, resolve);

  const effective = flattenTemplate(root, (ref) => {
    const child = resolve(ref);
    if (!child) throw new Error(`workflow.call references an unresolved template: ${ref.templateId}@${ref.templateVersion}`);
    return child;
  });
  // Defensive: validateWorkflowCalls already asserted these, but keep the
  // invariant local to the graph the instance actually pins.
  validateTemplate(effective);
  inferIterationScopes(effective);
  return effective;
};

/**
 * Builds the {@link StartInstance} command bound to the outbound ports.
 *
 * Side effects: stores seed artifacts, appends `InstanceStarted`, publishes
 * the event on the bus.
 */
export const makeStartInstance =
  (deps: Deps): StartInstance =>
  async ({ templateRef, seeds, cwd, channelId }) => {
    const template = await deps.templates.resolveRef(templateRef);
    // Flatten any `workflow.call` into the effective graph and pin it on the
    // instance (§6). `undefined` when the template has no sub-workflows.
    const effectiveTemplate = await resolveEffectiveTemplate(deps.templates, template);
    // The variable defaults — and everything downstream — operate on the graph
    // the instance actually runs: the flattened one when present (so namespaced
    // sub-workflow internals with a default get materialized too).
    const runTemplate = effectiveTemplate ?? template;
    const seedIds: ArtifactId[] = [];
    for (const s of seeds) {
      const a = await deps.artifactStore.put(s.kind, s.content, { role: "seed" });
      seedIds.push(a.id);
    }
    // Materialize each variable's `defaultValue` into an artifact so it can be
    // pre-assigned in the instance before any step runs. `put` validates the
    // content against the kind and throws on a malformed default — surfacing
    // the error at launch rather than silently leaving the slot empty.
    const variableDefaults: { name: string; artifactId: ArtifactId }[] = [];
    for (const v of runTemplate.variables) {
      if (v.defaultValue === undefined) continue;
      const a = await deps.artifactStore.put(v.kind, v.defaultValue, { role: "seed" });
      variableDefaults.push({ name: v.name, artifactId: asArtifactId(a.id) });
    }
    const instanceId = asWorkflowId(deps.ids.newId());
    const trimmedCwd = typeof cwd === "string" ? cwd.trim() : "";
    const evt: DomainEvent = {
      type: "InstanceStarted",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId,
      templateId: template.id,
      templateVersion: template.version,
      seed: seedIds.map((id) => asArtifactId(id)),
      ...(variableDefaults.length ? { variableDefaults } : {}),
      ...(trimmedCwd ? { cwd: trimmedCwd } : {}),
      ...(effectiveTemplate ? { effectiveTemplate } : {}),
      channelId: channelId ?? deps.channels.getActive(),
    };
    await deps.log.append(evt);
    await deps.bus.publish(evt);
    return { instanceId };
  };
