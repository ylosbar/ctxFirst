import { afterEach, describe, expect, it } from "vitest";
import { createOrchestratorHarness, type OrchestratorHarness } from "./fixtures/orchestrator-harness";
import { TEMPLATE_LINEAR } from "./fixtures/builders";

let harness: OrchestratorHarness | null = null;

afterEach(() => {
  harness?.stop();
  harness = null;
});

describe("OrchestratorHarness — smoke", () => {
  it("drives a user.input → human.gate template to completion", async () => {
    harness = createOrchestratorHarness({ templates: [TEMPLATE_LINEAR] });

    const { instanceId } = await harness.startInstance({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [{ kind: "Markdown", content: "hello" }],
    });

    await harness.waitForStatus(instanceId, "awaitingHuman");

    const inst = harness.state.getInstance(instanceId);
    expect(inst?.status).toBe("awaitingHuman");
    const awaitingExec = inst?.executions.find((e) => e.status === "awaitingHuman");
    expect(awaitingExec).toBeDefined();

    await harness.submitHumanDecision({
      instanceId,
      stepExecId: awaitingExec!.id,
      by: "tester",
    });

    await harness.waitForStatus(instanceId, "completed");

    const final = harness.state.getInstance(instanceId);
    expect(final?.status).toBe("completed");
    expect(harness.fakes.bus.ofType("InstanceCompleted")).toHaveLength(1);
    expect(harness.fakes.bus.ofType("StepValidated").some((e) => e.by === "tester")).toBe(true);
  });

  it("emits InstanceStarted with the active channelId", async () => {
    harness = createOrchestratorHarness({ templates: [TEMPLATE_LINEAR] });
    harness.fakes.channels.setActive("custom-channel");

    const { instanceId } = await harness.startInstance({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [{ kind: "Markdown", content: "hello" }],
    });

    const started = harness.fakes.bus.ofType("InstanceStarted")[0];
    expect(started.instanceId).toBe(instanceId);
    expect(started.channelId).toBe("custom-channel");
  });

  it("rejects an unknown template ref", async () => {
    harness = createOrchestratorHarness();
    await expect(
      harness.startInstance({
        templateRef: "unknown@v1",
        seeds: [{ kind: "Markdown", content: "x" }],
      }),
    ).rejects.toThrow(/unknown template/);
  });
});
