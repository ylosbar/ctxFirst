import type { LlmSessionStore } from "../../application/ports/outbound/llm-session-store";
import type { LlmSessionEvent } from "../../application/ports/outbound/event-bus";
import type { StepExecId } from "../../domain/ids";

export type FakeLlmSessionStore = LlmSessionStore & {
  push(evt: LlmSessionEvent): void;
  reset(): void;
};

export const createFakeLlmSessionStore = (): FakeLlmSessionStore => {
  const byExec = new Map<StepExecId, LlmSessionEvent[]>();

  return {
    async listByStepExec(stepExecId) {
      return [...(byExec.get(stepExecId) ?? [])].sort((a, b) => a.seq - b.seq);
    },
    push(evt) {
      const id = evt.stepExecId as StepExecId;
      const bucket = byExec.get(id) ?? [];
      bucket.push(evt);
      byExec.set(id, bucket);
    },
    reset() {
      byExec.clear();
    },
  };
};
