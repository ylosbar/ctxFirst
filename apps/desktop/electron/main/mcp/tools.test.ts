import { describe, expect, it } from "vitest";
import type { WfEngine } from "../wf/composition-root";
import {
  asArtifactId,
  asStepExecId,
  asStepId,
  asWorkflowId,
  type ArtifactId,
} from "../wf/domain/ids";
import { buildTemplate } from "../wf/__tests__/fixtures/builders";
import {
  createFakeArtifactSchemaRegistry,
  createFakeTemplateRegistry,
} from "../wf/__tests__/fixtures/fake-registries";
import { createStepRunnerRegistry } from "../wf/application/step-runner";
import { createUserInputRunner } from "../wf/plugins/user-input";
import { createHumanGateRunner } from "../wf/plugins/human-gate";
import { makeSaveTemplate } from "../wf/application/use-cases/save-template";
import { makeListNodeSpecs } from "../wf/application/use-cases/list-node-specs";
import { makeListArtifactSchemas } from "../wf/application/use-cases/list-artifact-schemas";
import { makeSaveArtifactSchema } from "../wf/application/use-cases/save-artifact-schema";
import type { WorkflowTemplate } from "../wf/domain/template";
import { invokeMcpTool, listMcpTools } from "./tools";

const fakeEngine = (over: Partial<WfEngine> = {}) =>
  ({
    listTemplates: async () => [],
    getTemplate: async () => {
      throw new Error("not implemented");
    },
    listNodeSpecs: async () => [],
    listStepKindSuggestions: async () => [],
    saveTemplate: async () => {},
    listSkills: async () => [],
    getSkill: async () => {
      throw new Error("not implemented");
    },
    saveSkill: async () => {},
    getInstanceTimeline: async () => null,
    artifactStore: {
      get: async () => {
        throw new Error("not implemented");
      },
    },
    ...over,
  }) as unknown as WfEngine;

/**
 * Engine stub wired to the *real* template-authoring use-cases (validation
 * included) over a fake SQLite-less registry + the two builtin runners. Lets
 * the MCP-tool tests exercise the genuine `validateTemplate` /
 * `validateTemplatePorts` path instead of mocking validation away.
 */
const authoringEngine = (initial: ReadonlyArray<WorkflowTemplate> = []) => {
  const templates = createFakeTemplateRegistry(initial);
  const runners = createStepRunnerRegistry();
  runners.register(createUserInputRunner());
  runners.register(createHumanGateRunner());
  const artifactSchemas = createFakeArtifactSchemaRegistry();
  const saveTemplate = makeSaveTemplate({ templates, runners, artifactSchemas });
  const listNodeSpecs = makeListNodeSpecs({ runners });
  return fakeEngine({
    saveTemplate,
    listNodeSpecs,
    getTemplate: (ref: string) => templates.resolveRef(ref),
    listStepKindSuggestions: (async (inputKind: string) =>
      inputKind === "KanbanItemRef"
        ? [
            {
              stepKindId: "plugin:kanban:load-item",
              label: "Load Kanban item",
              pluginId: "kanban",
              inputKind: "KanbanItemRef",
            },
          ]
        : []) as never,
  });
};

/**
 * Engine stub wired to the *real* artifact-schema use-cases over a fake
 * in-memory registry (built-ins included). Exercises the genuine
 * validation/persistence path of the `ctxfirst_*_artifact_kind` tools.
 */
const artifactEngine = () => {
  const artifactSchemas = createFakeArtifactSchemaRegistry();
  return fakeEngine({
    artifactSchemas,
    listArtifactSchemas: makeListArtifactSchemas({ artifactSchemas }),
    saveArtifactSchema: makeSaveArtifactSchema({ artifactSchemas }),
  });
};

/** Minimal structurally-valid draft: `user.input` → `human.gate`. */
const draftTemplate = (over: Partial<{ id: string; version: string }> = {}) =>
  buildTemplate(
    over.id ?? "linear-ticket-summary",
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
    {
      id: over.id ?? "linear-ticket-summary",
      version: over.version ?? "v1",
      exitSteps: ["gate"],
      status: "draft",
    },
  );

describe("listMcpTools (describeParam)", () => {
  const tools = listMcpTools();
  const byName = new Map(tools.map((t) => [t.name, t]));

  it("marks required string params as kind=string, optional=false", () => {
    const get = byName.get("ctxfirst_get_template");
    expect(get).toBeDefined();
    const ref = get!.parameters.find((p) => p.name === "ref");
    expect(ref).toEqual(
      expect.objectContaining({
        name: "ref",
        kind: "string",
        optional: false,
      }),
    );
    expect(ref!.description).toMatch(/Référence canonique/);
  });

  it("unwraps ZodOptional<ZodRecord> to kind=json, optional=true", () => {
    const save = byName.get("ctxfirst_save_skill");
    expect(save).toBeDefined();
    const meta = save!.parameters.find((p) => p.name === "meta");
    expect(meta).toEqual(
      expect.objectContaining({
        name: "meta",
        kind: "json",
        optional: true,
      }),
    );
  });

  it("returns empty parameters for handlers without inputs", () => {
    const list = byName.get("ctxfirst_list_templates");
    expect(list).toBeDefined();
    expect(list!.parameters).toEqual([]);
  });
});

describe("invokeMcpTool", () => {
  it("throws when the tool name is unknown", async () => {
    await expect(invokeMcpTool(fakeEngine(), "does_not_exist", {})).rejects.toThrow(
      /Unknown tool/,
    );
  });

  it("concatenates content[*].text returned by the handler", async () => {
    const engine = fakeEngine({
      listTemplates: async () =>
        [
          {
            id: "t",
            version: "v1",
            name: "T",
            description: "",
            status: "draft",
            steps: [],
            transitions: [],
            variables: [],
          },
        ] as never,
    });
    const { text } = await invokeMcpTool(engine, "ctxfirst_list_templates", {});
    const parsed = JSON.parse(text) as Array<{ ref: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.ref).toBe("t@v1");
  });

  it("throws a parseable Zod error when validation fails", async () => {
    await expect(invokeMcpTool(fakeEngine(), "ctxfirst_get_template", {})).rejects.toThrow(
      /ref/i,
    );
  });
});

describe("ctxfirst_*_artifact_kind", () => {
  const simplifiedSchema = {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  };

  it("lists built-ins with their canonical kind", async () => {
    const { text } = await invokeMcpTool(artifactEngine(), "ctxfirst_list_artifact_kinds", {});
    const kinds = JSON.parse(text) as Array<{ kind: string; source: { kind: string } }>;
    const byKind = new Map(kinds.map((k) => [k.kind, k]));
    expect(byKind.get("Markdown")?.source.kind).toBe("builtin");
    expect(byKind.get("String")).toBeDefined();
  });

  it("resolves a built-in kind detail (JSON schema, no Zod)", async () => {
    const { text } = await invokeMcpTool(artifactEngine(), "ctxfirst_get_artifact_kind", {
      kind: "Markdown",
    });
    const detail = JSON.parse(text) as { kind: string; simplifiedSchema: unknown };
    expect(detail.kind).toBe("Markdown");
    expect(detail.simplifiedSchema).toBeTruthy();
    expect(detail).not.toHaveProperty("schema");
  });

  it("throws for an unknown kind", async () => {
    await expect(
      invokeMcpTool(artifactEngine(), "ctxfirst_get_artifact_kind", { kind: "Nope" }),
    ).rejects.toThrow(/inconnu/i);
  });

  it("creates a user kind and round-trips it through get", async () => {
    const engine = artifactEngine();
    const { text } = await invokeMcpTool(engine, "ctxfirst_save_artifact_kind", {
      id: "Brief",
      version: "v1",
      name: "Brief",
      simplifiedSchema,
    });
    const saved = JSON.parse(text) as { kind: string; source: { kind: string } };
    expect(saved.kind).toBe("user:Brief@v1");
    expect(saved.source.kind).toBe("user");

    const { text: got } = await invokeMcpTool(engine, "ctxfirst_get_artifact_kind", {
      kind: "user:Brief@v1",
    });
    expect(JSON.parse(got).id).toBe("Brief");
  });

  it("rejects a save missing the required simplifiedSchema", async () => {
    await expect(
      invokeMcpTool(artifactEngine(), "ctxfirst_save_artifact_kind", {
        id: "Brief",
        version: "v1",
        name: "Brief",
      }),
    ).rejects.toThrow(/simplifiedSchema/i);
  });

  it("marks ctxfirst_save_artifact_kind destructive, reads non-destructive", async () => {
    const { createMcpToolProvider } = await import("./tools");
    const byName = new Map(
      createMcpToolProvider(fakeEngine()).list().map((t) => [t.name, t]),
    );
    expect(byName.get("ctxfirst_save_artifact_kind")?.destructive).toBe(true);
    expect(byName.get("ctxfirst_list_artifact_kinds")?.destructive).toBe(false);
    expect(byName.get("ctxfirst_get_artifact_kind")?.destructive).toBe(false);
  });
});

describe("ctxfirst_get_step_artifact", () => {
  const makeExecution = (over: Partial<Record<string, unknown>> = {}) => ({
    id: asStepExecId("exec-1"),
    stepId: asStepId("pick-best"),
    instanceId: asWorkflowId("run-42"),
    status: "validated",
    inputArtifacts: [],
    outputs: new Map([["out", asArtifactId("art-1")]]),
    outputArtifact: asArtifactId("art-1"),
    runs: [],
    ...over,
  });

  const makeState = (executions: Array<ReturnType<typeof makeExecution>>) => ({
    id: asWorkflowId("run-42"),
    templateId: "tpl",
    templateVersion: "v1",
    status: "running",
    seedArtifacts: [],
    executions,
    createdAt: "2025-01-01T00:00:00Z",
    channelId: "default",
    variables: new Map(),
    openLoops: [],
    iterations: new Map(),
  });

  it("returns the principal output (`out` port) by default", async () => {
    const engine = fakeEngine({
      getInstanceTimeline: async () => makeState([makeExecution()]) as never,
      artifactStore: {
        get: async (id: ArtifactId) => ({
          meta: {
            id,
            kind: "Markdown",
            hash: "deadbeef",
            storageRef: "/tmp/x.bin",
            metadata: { source: "test" },
            createdAt: "2025-01-01T00:00:01Z",
          },
          content: "Bonjour le monde",
        }),
      } as never,
    });
    const { text } = await invokeMcpTool(engine, "ctxfirst_get_step_artifact", {
      instanceId: "run-42",
      stepId: "pick-best",
    });
    const parsed = JSON.parse(text);
    expect(parsed.port).toBe("out");
    expect(parsed.artifactId).toBe("art-1");
    expect(parsed.content).toBe("Bonjour le monde");
    expect(parsed.truncated).toBe(false);
    expect(parsed.availablePorts).toEqual(["out"]);
  });

  it("picks the last execution when a step has been looped/re-run", async () => {
    const first = makeExecution({
      id: asStepExecId("exec-1"),
      status: "looped",
      outputs: new Map([["out", asArtifactId("art-old")]]),
      outputArtifact: asArtifactId("art-old"),
    });
    const second = makeExecution({
      id: asStepExecId("exec-2"),
      status: "validated",
      outputs: new Map([["out", asArtifactId("art-new")]]),
      outputArtifact: asArtifactId("art-new"),
    });
    const engine = fakeEngine({
      getInstanceTimeline: async () => makeState([first, second]) as never,
      artifactStore: {
        get: async (id: ArtifactId) => ({
          meta: {
            id,
            kind: "Markdown",
            hash: "h",
            storageRef: "/tmp/x.bin",
            metadata: {},
            createdAt: "2025-01-01T00:00:01Z",
          },
          content: `content-${id}`,
        }),
      } as never,
    });
    const { text } = await invokeMcpTool(engine, "ctxfirst_get_step_artifact", {
      instanceId: "run-42",
      stepId: "pick-best",
    });
    const parsed = JSON.parse(text);
    expect(parsed.stepExecId).toBe("exec-2");
    expect(parsed.artifactId).toBe("art-new");
  });

  it("targets the requested port when specified", async () => {
    const exec = makeExecution({
      outputs: new Map<string, ArtifactId>([
        ["out", asArtifactId("art-main")],
        ["debug", asArtifactId("art-debug")],
      ]),
    });
    const engine = fakeEngine({
      getInstanceTimeline: async () => makeState([exec]) as never,
      artifactStore: {
        get: async (id: ArtifactId) => ({
          meta: {
            id,
            kind: "Markdown",
            hash: "h",
            storageRef: "/tmp/x.bin",
            metadata: {},
            createdAt: "2025-01-01T00:00:01Z",
          },
          content: `content-${id}`,
        }),
      } as never,
    });
    const { text } = await invokeMcpTool(engine, "ctxfirst_get_step_artifact", {
      instanceId: "run-42",
      stepId: "pick-best",
      port: "debug",
    });
    const parsed = JSON.parse(text);
    expect(parsed.port).toBe("debug");
    expect(parsed.artifactId).toBe("art-debug");
    expect(parsed.availablePorts).toEqual(["out", "debug"]);
  });

  it("throws when the requested port has no artifact", async () => {
    const exec = makeExecution();
    const engine = fakeEngine({
      getInstanceTimeline: async () => makeState([exec]) as never,
    });
    await expect(
      invokeMcpTool(engine, "ctxfirst_get_step_artifact", {
        instanceId: "run-42",
        stepId: "pick-best",
        port: "missing",
      }),
    ).rejects.toThrow(/port "missing"/);
  });

  it("throws when the step has no execution at all", async () => {
    const engine = fakeEngine({
      getInstanceTimeline: async () => makeState([]) as never,
    });
    await expect(
      invokeMcpTool(engine, "ctxfirst_get_step_artifact", {
        instanceId: "run-42",
        stepId: "ghost",
      }),
    ).rejects.toThrow(/Aucune exécution/);
  });

  it("throws when the run is unknown", async () => {
    const engine = fakeEngine({
      getInstanceTimeline: async () => null,
    });
    await expect(
      invokeMcpTool(engine, "ctxfirst_get_step_artifact", {
        instanceId: "nope",
        stepId: "x",
      }),
    ).rejects.toThrow(/Run inconnu/);
  });

  it("truncates large content and reports fullSizeBytes", async () => {
    const big = "x".repeat(40_000);
    const engine = fakeEngine({
      getInstanceTimeline: async () => makeState([makeExecution()]) as never,
      artifactStore: {
        get: async (id: ArtifactId) => ({
          meta: {
            id,
            kind: "Markdown",
            hash: "h",
            storageRef: "/tmp/x.bin",
            metadata: {},
            createdAt: "2025-01-01T00:00:01Z",
          },
          content: big,
        }),
      } as never,
    });
    const { text } = await invokeMcpTool(engine, "ctxfirst_get_step_artifact", {
      instanceId: "run-42",
      stepId: "pick-best",
    });
    const parsed = JSON.parse(text);
    expect(parsed.truncated).toBe(true);
    expect(parsed.fullSizeBytes).toBe(40_000);
    expect(parsed.content.length).toBeLessThan(big.length);
    expect(parsed.content).toMatch(/tronqué/);
  });
});

describe("createMcpToolProvider", () => {
  it("marks ctxfirst_save_skill as destructive and leaves read-only tools alone", async () => {
    const { createMcpToolProvider } = await import("./tools");
    const provider = createMcpToolProvider(fakeEngine());
    const byName = new Map(provider.list().map((t) => [t.name, t]));
    expect(byName.get("ctxfirst_save_skill")?.destructive).toBe(true);
    expect(byName.get("ctxfirst_list_skills")?.destructive).toBe(false);
    expect(byName.get("ctxfirst_list_templates")?.destructive).toBe(false);
    expect(byName.get("ctxfirst_get_template")?.destructive).toBe(false);
  });

  it("invoke delegates to invokeMcpTool (same content concat)", async () => {
    const { createMcpToolProvider } = await import("./tools");
    const provider = createMcpToolProvider(
      fakeEngine({
        listTemplates: async () =>
          [
            {
              id: "t",
              version: "v1",
              name: "T",
              description: "",
              status: "draft",
              steps: [],
              transitions: [],
              variables: [],
            },
          ] as never,
      }),
    );
    const { text } = await provider.invoke("ctxfirst_list_templates", {});
    expect(JSON.parse(text)).toHaveLength(1);
  });

  it("marks ctxfirst_save_template as destructive", async () => {
    const { createMcpToolProvider } = await import("./tools");
    const provider = createMcpToolProvider(fakeEngine());
    const byName = new Map(provider.list().map((t) => [t.name, t]));
    expect(byName.get("ctxfirst_save_template")?.destructive).toBe(true);
    expect(byName.get("ctxfirst_list_node_specs")?.destructive).toBe(false);
    expect(byName.get("ctxfirst_list_step_kind_suggestions")?.destructive).toBe(false);
  });
});

describe("ctxfirst_list_node_specs", () => {
  it("returns one JSON spec per registered runner", async () => {
    const { text } = await invokeMcpTool(authoringEngine(), "ctxfirst_list_node_specs", {});
    const specs = JSON.parse(text) as Array<{ kind: string }>;
    const kinds = specs.map((s) => s.kind);
    expect(kinds).toContain("user.input");
    expect(kinds).toContain("human.gate");
    expect(specs).toHaveLength(2);
  });
});

describe("ctxfirst_list_step_kind_suggestions", () => {
  it("requires an inputKind argument", async () => {
    await expect(
      invokeMcpTool(authoringEngine(), "ctxfirst_list_step_kind_suggestions", {}),
    ).rejects.toThrow(/inputKind/i);
  });

  it("returns plugin suggestions matching the requested kind", async () => {
    const { text } = await invokeMcpTool(
      authoringEngine(),
      "ctxfirst_list_step_kind_suggestions",
      { inputKind: "KanbanItemRef" },
    );
    const suggestions = JSON.parse(text) as Array<{ stepKindId: string }>;
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.stepKindId).toBe("plugin:kanban:load-item");
  });

  it("returns an empty array for a kind nobody suggests for", async () => {
    const { text } = await invokeMcpTool(
      authoringEngine(),
      "ctxfirst_list_step_kind_suggestions",
      { inputKind: "Markdown" },
    );
    expect(JSON.parse(text)).toEqual([]);
  });
});

describe("ctxfirst_save_template", () => {
  it("persists a structurally-valid draft and echoes a summary", async () => {
    const engine = authoringEngine();
    const { text } = await invokeMcpTool(engine, "ctxfirst_save_template", {
      template: draftTemplate(),
    });
    const summary = JSON.parse(text) as { ref: string; status: string; stepCount: number };
    expect(summary.ref).toBe("linear-ticket-summary@v1");
    expect(summary.status).toBe("draft");
    expect(summary.stepCount).toBe(2);
    // Round-trips through the registry.
    const { text: got } = await invokeMcpTool(engine, "ctxfirst_get_template", {
      ref: "linear-ticket-summary@v1",
    });
    expect(JSON.parse(got).id).toBe("linear-ticket-summary");
  });

  it("refuses any status other than draft (no publish via chat)", async () => {
    const engine = authoringEngine();
    await expect(
      invokeMcpTool(engine, "ctxfirst_save_template", {
        template: { ...draftTemplate(), status: "published" },
      }),
    ).rejects.toThrow(/seuls les drafts/i);
  });

  it("refuses to overwrite an existing published ref", async () => {
    const published = { ...draftTemplate(), status: "published" } as WorkflowTemplate;
    const engine = authoringEngine([published]);
    await expect(
      invokeMcpTool(engine, "ctxfirst_save_template", { template: draftTemplate() }),
    ).rejects.toThrow(/publié \(immutable\)/i);
  });

  it("surfaces the validateTemplate error for a non-loop cycle", async () => {
    const engine = authoringEngine();
    const cyclic = buildTemplate(
      "cyclic",
      [
        {
          id: "a",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        {
          id: "b",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown", role: "Developer" },
        },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
      { id: "cyclic", version: "v1", exitSteps: ["b"], status: "draft" },
    );
    await expect(
      invokeMcpTool(engine, "ctxfirst_save_template", { template: cyclic }),
    ).rejects.toThrow(/cycle/i);
  });
});
