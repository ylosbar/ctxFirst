/**
 * Use-case: resolve a `human.gate` step with an *approval*. For rejection /
 * feedback, see {@link OpenFeedbackLoop} — which emits `LoopOpened` instead
 * of `StepValidated`.
 *
 * Emits a single `StepValidated` event; the orchestrator advances to the
 * next step in reaction to it.
 */
import type { ClockPort } from "../ports/outbound/clock";
import type { EventBus } from "../ports/outbound/event-bus";
import type { EventLog } from "../ports/outbound/event-log";
import type { IdGenerator } from "../ports/outbound/id-generator";
import type { DomainEvent } from "../../domain/events";
import { asEventId, type StepExecId, type WorkflowId } from "../../domain/ids";

type Deps = {
  bus: EventBus;
  log: EventLog;
  clock: ClockPort;
  ids: IdGenerator;
};

/** Input to {@link SubmitHumanDecision}. */
export type SubmitHumanDecisionInput = {
  instanceId: WorkflowId;
  stepExecId: StepExecId;
  /** Human identifier ("user" by default); stored for audit. */
  by?: string;
};

export type SubmitHumanDecision = (input: SubmitHumanDecisionInput) => Promise<void>;

/** Builds the command bound to the outbound ports. */
export const makeSubmitHumanDecision =
  (deps: Deps): SubmitHumanDecision =>
  async ({ instanceId, stepExecId, by }) => {
    const evt: DomainEvent = {
      type: "StepValidated",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId,
      stepExecId,
      by: by ?? "user",
    };
    await deps.log.append(evt);
    await deps.bus.publish(evt);
  };
