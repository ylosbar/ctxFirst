/**
 * Use-case: open a feedback loop from the current step back to an upstream
 * step, re-running that step with the human feedback re-injected into the
 * context. Rejected if the template does not declare the loop transition.
 *
 * Emits `LoopOpened`; the orchestrator reacts by invalidating the downstream
 * chain, starting a fresh execution of the target step, and emitting
 * `LoopClosed` once the new output is produced.
 */
import type { ClockPort } from "../ports/outbound/clock";
import type { EventBus } from "../ports/outbound/event-bus";
import type { EventLog } from "../ports/outbound/event-log";
import type { IdGenerator } from "../ports/outbound/id-generator";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { DomainEvent } from "../../domain/events";
import type { ReviewComment } from "../../domain/feedback";
import {
  asEventId,
  asLoopId,
  type StepExecId,
  type StepId,
  type WorkflowId,
} from "../../domain/ids";
import { canLoop } from "../../domain/services/transition-policy";
import type { EngineState } from "../engine-state";

type Deps = {
  bus: EventBus;
  log: EventLog;
  clock: ClockPort;
  ids: IdGenerator;
  templates: TemplateRegistry;
  state: EngineState;
};

/** Input to {@link OpenFeedbackLoop}. */
export type OpenFeedbackLoopInput = {
  instanceId: WorkflowId;
  /** The `awaitingHuman` step execution the user is looping from. */
  stepExecId: StepExecId;
  /** Upstream step to re-run. */
  toStepId: StepId;
  /** Free-form feedback summary — injected into the next prompt. */
  reason: string;
  /** Optional line-anchored review comments. */
  comments?: ReadonlyArray<ReviewComment>;
  /** Author of the feedback ("user" by default). */
  author?: string;
};

export type OpenFeedbackLoop = (input: OpenFeedbackLoopInput) => Promise<void>;

/**
 * Builds the command. Throws if the instance is unknown, the step exec is
 * unknown, or the requested transition is not authorized by the template.
 */
export const makeOpenFeedbackLoop =
  (deps: Deps): OpenFeedbackLoop =>
  async ({ instanceId, stepExecId, toStepId, reason, comments, author }) => {
    const inst = deps.state.getInstance(instanceId);
    if (!inst) throw new Error(`unknown instance ${instanceId}`);
    const template = await deps.templates.resolve(inst.templateId, inst.templateVersion);
    const fromExec = inst.executions.find((e) => e.id === stepExecId);
    if (!fromExec) throw new Error(`unknown stepExec ${stepExecId}`);
    if (!canLoop(template, fromExec.stepId, toStepId)) {
      throw new Error(`loop ${fromExec.stepId} -> ${toStepId} not permitted by template`);
    }
    const evt: DomainEvent = {
      type: "LoopOpened",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId,
      loopId: asLoopId(deps.ids.newId()),
      fromStepExec: stepExecId,
      toStepId,
      reason,
      comments,
      author: author ?? "user",
    };
    await deps.log.append(evt);
    await deps.bus.publish(evt);
  };
