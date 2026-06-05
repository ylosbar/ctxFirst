/**
 * Use-case: re-run a finished (`completed`) or stuck (`failed`) run from any
 * node, optionally with a one-off config correction. Generalizes
 * retry-from-failed — the target may be `validated` OR `failed`, and its whole
 * transitive downstream is recomputed (the upstream stays intact).
 *
 * Emits the intentional `StepRerunRequested`; the orchestrator reacts by
 * superseding the target + its downstream and re-starting the target. See
 * `specs/run-rerun-from-node.md`.
 */
import type { ClockPort } from "../ports/outbound/clock";
import type { EventBus } from "../ports/outbound/event-bus";
import type { EventLog } from "../ports/outbound/event-log";
import type { IdGenerator } from "../ports/outbound/id-generator";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { DomainEvent } from "../../domain/events";
import { asEventId, type StepExecId, type WorkflowId } from "../../domain/ids";
import { findStep } from "../../domain/template";
import type { EngineState } from "../engine-state";

type Deps = {
  bus: EventBus;
  log: EventLog;
  clock: ClockPort;
  ids: IdGenerator;
  state: EngineState;
  templates: TemplateRegistry;
};

/** Input to {@link RerunFromNode}. */
export type RerunFromNodeInput = {
  instanceId: WorkflowId;
  /** The exec (`validated` or `failed`) to replay from. */
  stepExecId: StepExecId;
  /** One-off config patch applied to the target node only (shallow merge). */
  configOverride?: Readonly<Record<string, unknown>>;
  /** Author of the replay ("user" by default), for audit. */
  author?: string;
};

export type RerunFromNode = (input: RerunFromNodeInput) => Promise<void>;

/**
 * Builds the command. Throws if the instance or step exec is unknown, or the
 * target exec is not in a replayable state (`validated` / `failed`).
 */
export const makeRerunFromNode =
  (deps: Deps): RerunFromNode =>
  async ({ instanceId, stepExecId, configOverride, author }) => {
    const inst = deps.state.getInstance(instanceId);
    if (!inst) throw new Error(`unknown instance ${instanceId}`);
    const exec = inst.executions.find((e) => e.id === stepExecId);
    if (!exec) throw new Error(`unknown stepExec ${stepExecId}`);
    // Guard: only replay from a validated or failed exec.
    if (exec.status !== "validated" && exec.status !== "failed") {
      throw new Error(
        `stepExec ${stepExecId} not replayable (status ${exec.status})`,
      );
    }
    // Guard: re-running a `loop.foreach` node itself (re-fan-out) is out of v1
    // scope — it would rebattle every iteration's item artifact and key. Reject
    // explicitly. Re-running a step inside/outside a scope is supported (the
    // orchestrator restricts the replay to the target's iterationKey).
    const template =
      inst.effectiveTemplate ??
      (await deps.templates.resolve(inst.templateId, inst.templateVersion));
    if (findStep(template, exec.stepId).kind === "loop.foreach") {
      throw new Error(
        `stepExec ${stepExecId} is a loop.foreach node — re-running the fan-out is not supported (v1)`,
      );
    }
    const evt: DomainEvent = {
      type: "StepRerunRequested",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId,
      stepExecId,
      author: author ?? "user",
      ...(configOverride ? { configOverride } : {}),
    };
    await deps.log.append(evt);
    await deps.bus.publish(evt);
  };
