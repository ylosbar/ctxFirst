// Unit tests for the linear plugin's two step runners. The runners are pure
// CommonJS (see main.js), so we exercise them directly without the host
// loader. The gateway and artifact store are stubbed.
//
// Tests use ESM `import` (Vitest's import surface is ESM-only); the CJS
// module under test is consumed via the interop default export.

import { describe, expect, it } from "vitest";
import linearPlugin from "./main.js";

const {
  createLinearFetchRunner,
  createLinearSplitRunner,
  createLinearSetStatusRunner,
  formatLinearTicket,
  TICKET_KIND,
} = linearPlugin;

const createStubArtifactStore = () => {
  const stored = [];
  let counter = 0;
  return {
    async put(kind, content, metadata) {
      counter += 1;
      stored.push({ kind, content, metadata: metadata ?? {} });
      return {
        id: `artifact-${counter}`,
        kind,
        hash: `hash-${counter}`,
        storageRef: "stub",
        metadata: metadata ?? {},
        createdAt: "2026-05-12T00:00:00.000Z",
      };
    },
    async get() {
      throw new Error("not implemented");
    },
    async getByHash() {
      return null;
    },
    all: () => stored,
  };
};

const buildCtx = ({ inputs = [], step = {}, store, linear }) => ({
  instanceId: "wf-1",
  stepExecId: "exec-1",
  stepId: "step-1",
  step: {
    id: "step-1",
    name: "linear-step",
    kind: step.kind ?? "linear.split",
    actorRole: "Developer",
    config: step.config ?? {},
    humanGateRequired: false,
  },
  inputs,
  loopHistory: [],
  attempt: 0,
  workspace: {},
  deps: {
    artifactStore: store,
    linear,
  },
});

const ticketFixture = {
  identifier: "ENG-123",
  title: "Implement linear.split",
  state: "Todo",
  priority: 2,
  url: "https://linear.app/example/issue/ENG-123",
  labels: ["backend"],
  comments: [],
  renderedMarkdown:
    "# ENG-123 — Implement linear.split\n\n## Description\n\nA test description.\n",
};

describe("formatLinearTicket", () => {
  it("renders headers, description and comments as Markdown", () => {
    const md = formatLinearTicket({
      identifier: "ENG-1",
      title: "Hello",
      description: "<p>Hello <b>world</b></p>",
      state: "Todo",
      priority: 2,
      priorityLabel: "High",
      assignee: "alice",
      team: "Eng",
      labels: ["backend", "p0"],
      url: "https://linear.app/x/ENG-1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
      comments: [
        { author: "bob", body: "lgtm", createdAt: "2026-01-03" },
      ],
    });
    expect(md.startsWith("# ENG-1 — Hello")).toBe(true);
    expect(md).toContain("- **State**: Todo");
    expect(md).toContain("- **Priority**: High");
    expect(md).toContain("- **Labels**: backend, p0");
    expect(md).toContain("Hello world");
    expect(md).toContain("### Comment #1 — bob (2026-01-03)");
    expect(md.endsWith("\n")).toBe(true);
  });
});

describe("linear.fetch runner — resolveSpec", () => {
  it("declares one LinearRef input and one plugin Ticket output", () => {
    const spec = createLinearFetchRunner().resolveSpec();
    expect(spec.inputs).toEqual([
      { name: "ref", kinds: ["LinearRef"], optional: true, primary: true },
    ]);
    expect(spec.outputs.map((o) => ({ name: o.name, kind: o.kind }))).toEqual([
      { name: "ticket", kind: TICKET_KIND },
    ]);
  });
});

describe("linear.fetch runner — run", () => {
  it("calls the gateway with the ref from the input payload", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async fetchTicket(ref) {
        calls.push(ref);
        return {
          identifier: "ABC-1",
          title: "T",
          description: "D",
          state: "Todo",
          priority: 1,
          priorityLabel: "Urgent",
          assignee: null,
          team: null,
          labels: [],
          url: "https://linear.app/x/ABC-1",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
          comments: [],
        };
      },
    };
    const ctx = buildCtx({
      inputs: [
        {
          port: "ref",
          kind: "LinearRef",
          content: "ABC-1",
          payload: { value: "ABC-1" },
          artifactId: "artifact-src",
        },
      ],
      store,
      linear,
    });
    const outcome = await createLinearFetchRunner().run(ctx);
    expect(calls).toEqual(["ABC-1"]);
    expect(outcome.kind).toBe("produced");
    expect(outcome.artifact.kind).toBe(TICKET_KIND);
    const persisted = store.all();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].kind).toBe(TICKET_KIND);
    expect(persisted[0].metadata.identifier).toBe("ABC-1");
    expect(persisted[0].metadata.payloadFormat).toBe("json-v1");
  });

  it("falls back to config.ticketRef when no input is wired", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async fetchTicket(ref) {
        calls.push(ref);
        return {
          identifier: "ABC-2",
          title: "T",
          description: "",
          state: "Done",
          priority: 0,
          priorityLabel: "—",
          assignee: null,
          team: null,
          labels: [],
          url: "https://linear.app/x/ABC-2",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
          comments: [],
        };
      },
    };
    const ctx = buildCtx({
      inputs: [],
      step: { kind: "linear.fetch", config: { ticketRef: " ABC-2 " } },
      store,
      linear,
    });
    await createLinearFetchRunner().run(ctx);
    expect(calls).toEqual(["ABC-2"]);
  });

  it("throws when no ref can be resolved", async () => {
    const ctx = buildCtx({
      inputs: [],
      step: { kind: "linear.fetch", config: {} },
      store: createStubArtifactStore(),
      linear: { async fetchTicket() { throw new Error("unreachable"); } },
    });
    await expect(createLinearFetchRunner().run(ctx)).rejects.toThrow(
      /requires a ticket ref/,
    );
  });
});

describe("linear.split runner — resolveSpec", () => {
  it("declares one Ticket input and two Markdown outputs", () => {
    const spec = createLinearSplitRunner().resolveSpec();
    expect(spec.inputs).toEqual([
      { name: "ticket", kinds: [TICKET_KIND], optional: false, primary: true },
    ]);
    expect(spec.outputs.map((o) => ({ name: o.name, kind: o.kind }))).toEqual([
      { name: "title", kind: "Markdown" },
      { name: "description", kind: "Markdown" },
    ]);
  });
});

describe("linear.split runner — guards", () => {
  it("throws when no input is wired", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({ inputs: [], store });
    await expect(createLinearSplitRunner().run(ctx)).rejects.toThrow(
      /requires a Linear Ticket input/,
    );
  });

  it("throws when input kind is not the plugin Ticket kind", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      inputs: [
        {
          port: "ticket",
          kind: "Markdown",
          content: "not a ticket",
          payload: { format: "markdown", body: "not a ticket" },
          artifactId: "artifact-x",
        },
      ],
      store,
    });
    await expect(createLinearSplitRunner().run(ctx)).rejects.toThrow(
      new RegExp(`expects a ${TICKET_KIND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} input`),
    );
  });
});

describe("linear.split runner — outcomes", () => {
  it("emits title and description Markdown artifacts with metadata", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      inputs: [
        {
          port: "ticket",
          kind: TICKET_KIND,
          content: JSON.stringify(ticketFixture),
          payload: ticketFixture,
          artifactId: "artifact-source",
        },
      ],
      store,
    });
    const outcome = await createLinearSplitRunner().run(ctx);
    expect(outcome.kind).toBe("produced-many");
    expect(outcome.artifacts.map((a) => a.port)).toEqual([
      "title",
      "description",
    ]);
    expect(outcome.artifacts.every((a) => a.artifact.kind === "Markdown")).toBe(
      true,
    );

    const persisted = store.all();
    expect(persisted).toHaveLength(2);
    expect(JSON.parse(persisted[0].content)).toEqual({
      format: "markdown",
      body: ticketFixture.title,
    });
    expect(persisted[0].metadata).toMatchObject({
      provider: "linear",
      identifier: ticketFixture.identifier,
      url: ticketFixture.url,
      slot: "title",
    });
    expect(JSON.parse(persisted[1].content)).toEqual({
      format: "markdown",
      body: ticketFixture.renderedMarkdown,
    });
    expect(persisted[1].metadata.slot).toBe("description");
  });

  it("falls back to JSON.parse(content) when payload is null", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      inputs: [
        {
          port: "ticket",
          kind: TICKET_KIND,
          content: JSON.stringify(ticketFixture),
          payload: null,
          artifactId: "artifact-source",
        },
      ],
      store,
    });
    const outcome = await createLinearSplitRunner().run(ctx);
    expect(outcome.kind).toBe("produced-many");
    expect(outcome.artifacts).toHaveLength(2);
  });
});

const buildGatewayTicket = (over = {}) => ({
  identifier: over.identifier ?? "ENG-9",
  title: over.title ?? "Some ticket",
  description: over.description ?? "",
  state: over.state ?? "In Progress",
  priority: over.priority ?? 2,
  priorityLabel: over.priorityLabel ?? "High",
  assignee: over.assignee ?? null,
  team: over.team ?? null,
  labels: over.labels ?? [],
  url: over.url ?? "https://linear.app/x/ENG-9",
  createdAt: over.createdAt ?? "2026-01-01",
  updatedAt: over.updatedAt ?? "2026-01-02",
  comments: over.comments ?? [],
});

describe("linear.set-status runner — resolveSpec", () => {
  it("declares a ref + status input and one plugin Ticket output", () => {
    const spec = createLinearSetStatusRunner().resolveSpec();
    expect(spec.inputs).toEqual([
      {
        name: "ref",
        kinds: ["LinearRef", TICKET_KIND],
        optional: true,
        primary: true,
      },
      { name: "status", kinds: ["Markdown", "Text"], optional: true },
    ]);
    expect(spec.outputs.map((o) => ({ name: o.name, kind: o.kind }))).toEqual([
      { name: "ticket", kind: TICKET_KIND },
    ]);
  });
});

describe("linear.set-status runner — run", () => {
  it("calls the gateway with ref + status from inputs and emits the updated ticket", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async setTicketStatus(ref, status) {
        calls.push({ ref, status });
        return buildGatewayTicket({ identifier: ref, state: status });
      },
    };
    const ctx = buildCtx({
      inputs: [
        {
          port: "ref",
          kind: "LinearRef",
          content: "ENG-9",
          payload: { value: "ENG-9" },
          artifactId: "a-ref",
        },
        {
          port: "status",
          kind: "Markdown",
          content: "Done",
          payload: { format: "markdown", body: "Done" },
          artifactId: "a-status",
        },
      ],
      step: { kind: "linear.set-status" },
      store,
      linear,
    });
    const outcome = await createLinearSetStatusRunner().run(ctx);
    expect(calls).toEqual([{ ref: "ENG-9", status: "Done" }]);
    expect(outcome.kind).toBe("produced");
    expect(outcome.artifact.kind).toBe(TICKET_KIND);

    const persisted = store.all();
    expect(persisted).toHaveLength(1);
    expect(JSON.parse(persisted[0].content).state).toBe("Done");
    expect(persisted[0].metadata.requestedStatus).toBe("Done");
    expect(persisted[0].metadata.state).toBe("Done");
  });

  it("derives the ref from a Ticket input and the status from config", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async setTicketStatus(ref, status) {
        calls.push({ ref, status });
        return buildGatewayTicket({ identifier: ref, state: status });
      },
    };
    const ctx = buildCtx({
      inputs: [
        {
          port: "ref",
          kind: TICKET_KIND,
          content: JSON.stringify(ticketFixture),
          payload: ticketFixture,
          artifactId: "a-ticket",
        },
      ],
      step: { kind: "linear.set-status", config: { status: " Done " } },
      store,
      linear,
    });
    await createLinearSetStatusRunner().run(ctx);
    expect(calls).toEqual([{ ref: ticketFixture.identifier, status: "Done" }]);
  });

  it("throws when no status can be resolved", async () => {
    const ctx = buildCtx({
      inputs: [
        {
          port: "ref",
          kind: "LinearRef",
          content: "ENG-9",
          payload: { value: "ENG-9" },
          artifactId: "a-ref",
        },
      ],
      step: { kind: "linear.set-status", config: {} },
      store: createStubArtifactStore(),
      linear: {
        async setTicketStatus() {
          throw new Error("unreachable");
        },
      },
    });
    await expect(createLinearSetStatusRunner().run(ctx)).rejects.toThrow(
      /requires a target status/,
    );
  });

  it("throws when no ref can be resolved", async () => {
    const ctx = buildCtx({
      inputs: [
        {
          port: "status",
          kind: "Markdown",
          content: "Done",
          payload: { format: "markdown", body: "Done" },
          artifactId: "a-status",
        },
      ],
      step: { kind: "linear.set-status", config: {} },
      store: createStubArtifactStore(),
      linear: {
        async setTicketStatus() {
          throw new Error("unreachable");
        },
      },
    });
    await expect(createLinearSetStatusRunner().run(ctx)).rejects.toThrow(
      /requires a ticket ref/,
    );
  });
});
