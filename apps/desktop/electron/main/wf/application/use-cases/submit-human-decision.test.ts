import { describe, expect, it } from "vitest";
import { makeSubmitHumanDecision } from "./submit-human-decision";
import { createFakeClock } from "../../__tests__/fixtures/fake-clock";
import { createFakeEventBus } from "../../__tests__/fixtures/fake-event-bus";
import { createFakeEventLog } from "../../__tests__/fixtures/fake-event-log";
import { createFakeIdGenerator } from "../../__tests__/fixtures/fake-ids";
import { asStepExecId, asWorkflowId } from "../../domain/ids";

const buildDeps = () => {
  const fakes = {
    bus: createFakeEventBus(),
    log: createFakeEventLog(),
    clock: createFakeClock(),
    ids: createFakeIdGenerator(),
  };
  return { fakes, submit: makeSubmitHumanDecision(fakes) };
};

describe("submitHumanDecision use-case", () => {
  it("emits a StepValidated event with the provided ids and actor", async () => {
    const { fakes, submit } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    const stepExecId = asStepExecId("exec-1");

    await submit({ instanceId, stepExecId, by: "alice" });

    expect(fakes.bus.ofType("StepValidated")).toHaveLength(1);
    const evt = fakes.bus.ofType("StepValidated")[0];
    expect(evt.instanceId).toBe(instanceId);
    expect(evt.stepExecId).toBe(stepExecId);
    expect(evt.by).toBe("alice");
    expect(evt.eventId).toMatch(/^id-/);
    expect(evt.at).toMatch(/^2026-/);
  });

  it("defaults the `by` field to 'user' when omitted", async () => {
    const { fakes, submit } = buildDeps();
    await submit({
      instanceId: asWorkflowId("wf-1"),
      stepExecId: asStepExecId("exec-1"),
    });
    expect(fakes.bus.ofType("StepValidated")[0].by).toBe("user");
  });

  it("appends to the log before publishing on the bus", async () => {
    const { fakes, submit } = buildDeps();
    const order: string[] = [];
    const origAppend = fakes.log.append;
    fakes.log.append = async (e) => {
      order.push("append");
      return origAppend(e);
    };
    fakes.bus.subscribe(() => {
      order.push("publish");
    });
    await submit({
      instanceId: asWorkflowId("wf-1"),
      stepExecId: asStepExecId("exec-1"),
    });
    expect(order).toEqual(["append", "publish"]);
  });

  it("mints a fresh event id on every call", async () => {
    const { fakes, submit } = buildDeps();
    await submit({
      instanceId: asWorkflowId("wf-1"),
      stepExecId: asStepExecId("exec-1"),
    });
    await submit({
      instanceId: asWorkflowId("wf-1"),
      stepExecId: asStepExecId("exec-2"),
    });
    const ids = fakes.bus.ofType("StepValidated").map((e) => e.eventId);
    expect(new Set(ids).size).toBe(2);
  });
});
