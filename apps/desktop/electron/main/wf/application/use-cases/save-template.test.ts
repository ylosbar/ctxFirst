import { describe, expect, it } from "vitest";
import { makeSaveTemplate } from "./save-template";
import { buildTemplate } from "../../__tests__/fixtures/builders";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";
import { createUserInputRunner } from "../../plugins/user-input";
import { createHumanGateRunner } from "../../plugins/human-gate";
import { createStepRunnerRegistry } from "../step-runner";

const buildDeps = () => {
  const templates = createFakeTemplateRegistry();
  const runners = createStepRunnerRegistry();
  runners.register(createUserInputRunner());
  runners.register(createHumanGateRunner());
  return { templates, runners, save: makeSaveTemplate({ templates, runners }) };
};

describe("saveTemplate use-case", () => {
  it("happy path: validates and persists a structurally sound template", async () => {
    const { templates, save } = buildDeps();
    const tpl = buildTemplate(
      "ok",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        {
          id: "gate",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown", role: "Developer" },
        },
      ],
      [{ from: "input", to: "gate" }],
      { id: "ok", version: "v1", exitSteps: ["gate"] },
    );

    await save(tpl);
    expect(templates.getById(tpl.id, tpl.version)).toBeDefined();
  });

  it("throws and does not persist when structural validation fails", async () => {
    const { templates, save } = buildDeps();
    const tpl = buildTemplate(
      "broken",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
      ],
      [
        // Edge references an unknown step.
        { from: "input", to: "ghost" },
      ],
      { id: "broken", version: "v1", exitSteps: ["input"] },
    );

    await expect(save(tpl)).rejects.toThrow(/unknown step|transition/i);
    expect(templates.getById(tpl.id, tpl.version)).toBeUndefined();
  });

  it("throws when no runner is registered for a step kind", async () => {
    const { templates, save } = buildDeps();
    const tpl = buildTemplate(
      "no-runner",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        {
          id: "mystery",
          kind: "mystery.kind",
          humanGateRequired: false,
        },
      ],
      [{ from: "input", to: "mystery" }],
      { id: "no-runner", version: "v1", exitSteps: ["mystery"] },
    );

    await expect(save(tpl)).rejects.toThrow();
    expect(templates.getById(tpl.id, tpl.version)).toBeUndefined();
  });
});
