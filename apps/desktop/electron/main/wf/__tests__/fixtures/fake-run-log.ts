import type { RunLog, RunRecord } from "../../application/ports/outbound/run-log";
import type { StepExecId } from "../../domain/ids";

export type FakeRunLog = RunLog & {
  readonly records: ReadonlyArray<RunRecord>;
  reset(): void;
};

export const createFakeRunLog = (): FakeRunLog => {
  const records: RunRecord[] = [];

  return {
    async record(run) {
      records.push(run);
    },
    async listByStepExec(id: StepExecId) {
      return records.filter((r) => r.stepExecId === id);
    },
    get records() {
      return records;
    },
    reset() {
      records.length = 0;
    },
  };
};
