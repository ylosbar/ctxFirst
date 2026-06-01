import { describe, expect, it } from "vitest";
import { makeListStepKindSuggestions } from "./list-step-kind-suggestions";
import { createFakeStepKindSuggestions } from "../../__tests__/fixtures/fake-registries";

describe("listStepKindSuggestions use-case", () => {
  it("forwards to the registry, filtered by inputKind", async () => {
    const stepKindSuggestions = createFakeStepKindSuggestions();
    stepKindSuggestions.setPluginContributions([
      {
        pluginId: "p1",
        suggestions: [
          {
            stepKindId: "transform.run",
            label: "Transform",
            inputKind: "Markdown",
            role: "Developer",
          },
          {
            stepKindId: "transform.run",
            label: "Other",
            inputKind: "plugin:linear:Ticket@v1",
            role: "Developer",
          },
        ],
      },
    ]);

    const list = makeListStepKindSuggestions({ stepKindSuggestions });
    const md = await list("Markdown");
    expect(md).toHaveLength(1);
    expect(md[0].pluginId).toBe("p1");

    expect(await list("Path")).toHaveLength(0);
  });
});
