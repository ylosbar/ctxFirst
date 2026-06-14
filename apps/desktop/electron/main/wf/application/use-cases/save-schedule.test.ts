import { describe, expect, it, vi } from "vitest";
import { makeSaveSchedule } from "./save-schedule";
import { buildTemplate } from "../../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";
import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type { SchedulerService } from "../scheduler/scheduler-service";
import type { ScheduleDraft, WorkflowSchedule } from "../../domain/schedule";
import { asScheduleId } from "../../domain/schedule";

const fakeSaved = (draft: ScheduleDraft): WorkflowSchedule => ({
  id: asScheduleId("sch-1"),
  channelId: null,
  name: draft.name,
  templateRef: draft.templateRef,
  cron: draft.cron,
  seeds: draft.seeds,
  enabled: draft.enabled,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const buildDeps = (template = buildTemplate("t", [{ id: "s1", kind: "human.review" }], [])) => {
  const save = vi.fn(async (draft: ScheduleDraft) => fakeSaved(draft));
  const reload = vi.fn(async () => {});
  const registry = { save } as unknown as ScheduleRegistry;
  const scheduler = { reload } as unknown as SchedulerService;
  const templates = createFakeTemplateRegistry([template]);
  return { save, reload, saveSchedule: makeSaveSchedule({ registry, templates, scheduler }) };
};

const draftFor = (templateRef: string): ScheduleDraft => ({
  name: "Daily",
  templateRef,
  cron: "0 9 * * *",
  seeds: [{ kind: "Markdown", content: "x" }],
  enabled: true,
});

describe("makeSaveSchedule — required launch input guard", () => {
  it("saves and reloads for a template with no required launch input", async () => {
    const { save, reload, saveSchedule } = buildDeps();
    await saveSchedule(draftFor("t@v1"));
    expect(save).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("saves a template whose launch inputs all have defaults (schedulable)", async () => {
    const tpl = buildTemplate("t", [{ id: "s1", kind: "human.review" }], [], {
      variables: [
        { name: "endpoint", kind: "Markdown", promptAtLaunch: true, defaultValue: "https://x" },
      ],
    });
    const { save, saveSchedule } = buildDeps(tpl);
    await saveSchedule(draftFor("t@v1"));
    expect(save).toHaveBeenCalledOnce();
  });

  it("refuses to schedule a template with a required launch input (promptAtLaunch, no default)", async () => {
    const tpl = buildTemplate("t", [{ id: "s1", kind: "human.review" }], [], {
      variables: [{ name: "endpoint", kind: "Markdown", promptAtLaunch: true }],
    });
    const { save, reload, saveSchedule } = buildDeps(tpl);
    await expect(saveSchedule(draftFor("t@v1"))).rejects.toThrow(
      /cannot be scheduled.*endpoint/,
    );
    expect(save).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("refuses even when the required launch input is role:input (root run cannot seed it)", async () => {
    const tpl = buildTemplate("t", [{ id: "s1", kind: "human.review" }], [], {
      variables: [{ name: "ticketId", kind: "Markdown", role: "input", promptAtLaunch: true }],
    });
    const { save, saveSchedule } = buildDeps(tpl);
    await expect(saveSchedule(draftFor("t@v1"))).rejects.toThrow(/cannot be scheduled/);
    expect(save).not.toHaveBeenCalled();
  });
});
