/* eslint-disable no-console */
import type { DomainEvent } from "./domain/events";
import type { EventBus, LlmSessionBus } from "./application/ports/outbound/event-bus";

const shortId = (s: string | undefined, n = 8) => (s ? s.slice(0, n) : "-");

const summarize = (evt: DomainEvent): string => {
  switch (evt.type) {
    case "InstanceStarted":
      return `instance=${shortId(evt.instanceId)} template=${evt.templateId}@${evt.templateVersion} seeds=${evt.seed.length}`;
    case "StepStarted":
      return `step=${evt.stepId} kind=${evt.kind} exec=${shortId(evt.stepExecId)}${evt.loopFrom ? ` loopFrom=${shortId(evt.loopFrom)}` : ""}`;
    case "StepProducedArtifact":
      return `exec=${shortId(evt.stepExecId)} artifact=${shortId(evt.artifactId)}`;
    case "StepAwaitingHumanGate":
      return `exec=${shortId(evt.stepExecId)} role=${evt.actorRole}`;
    case "StepValidated":
      return `exec=${shortId(evt.stepExecId)} by=${evt.by}`;
    case "StepFailed":
      return `exec=${shortId(evt.stepExecId)} error=${evt.error}`;
    case "LoopOpened":
      return `from=${shortId(evt.fromStepExec)} to=${evt.toStepId} reason="${evt.reason.slice(0, 60)}"`;
    case "LoopClosed":
      return `loop=${shortId(evt.loopId)}`;
    case "InstanceCompleted":
      return `instance=${shortId(evt.instanceId)} final=${shortId(evt.finalArtifact)}`;
    default:
      return "";
  }
};

export const attachBusLogger = (bus: EventBus, session: LlmSessionBus): void => {
  bus.subscribe((evt) => {
    console.log(`[wf:event] ${evt.type} · ${summarize(evt)}`);
  });
  let pending: Record<string, { text: number; tools: number }> = {};
  let flushTimer: NodeJS.Timeout | null = null;
  session.subscribe((ev) => {
    const slot =
      pending[ev.stepExecId] ?? (pending[ev.stepExecId] = { text: 0, tools: 0 });
    if (ev.payload.type === "text-delta") slot.text += ev.payload.text.length;
    else if (ev.payload.type === "tool-use" || ev.payload.type === "tool-result")
      slot.tools += 1;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      for (const [exec, n] of Object.entries(pending)) {
        console.log(
          `[wf:session] exec=${shortId(exec)} +${n.text} chars +${n.tools} tools`,
        );
      }
      pending = {};
      flushTimer = null;
    }, 200);
  });
};
