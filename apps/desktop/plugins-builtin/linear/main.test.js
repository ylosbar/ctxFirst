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
  createLinearCommentRunner,
  createLinearTriageFetchRunner,
  extractDescriptionImageRefs,
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
        kinds: ["LinearRef", TICKET_KIND, "Json"],
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

  it("derives the ref from a triage Json envelope (json.transform output)", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async setTicketStatus(ref, status) {
        calls.push({ ref, status });
        return buildGatewayTicket({ identifier: ref, state: status });
      },
    };
    // Shape emitted by `linear.triage.fetch → json.transform` ($[0]): a `Json`
    // envelope whose `body` is a JSON string wrapping the extracted item(s).
    const ctx = buildCtx({
      inputs: [
        {
          port: "ref",
          kind: "Json",
          content: JSON.stringify({
            format: "json",
            body: JSON.stringify([{ identifier: "ENG-42", title: "Triaged" }]),
          }),
          payload: {
            format: "json",
            body: JSON.stringify([{ identifier: "ENG-42", title: "Triaged" }]),
          },
          artifactId: "a-json",
        },
      ],
      step: { kind: "linear.set-status", config: { status: "Backlog" } },
      store,
      linear,
    });
    await createLinearSetStatusRunner().run(ctx);
    expect(calls).toEqual([{ ref: "ENG-42", status: "Backlog" }]);
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

describe("linear.comment runner — resolveSpec", () => {
  it("declares a ref + body input and one plugin Ticket output", () => {
    const spec = createLinearCommentRunner().resolveSpec();
    expect(spec.inputs).toEqual([
      {
        name: "ref",
        kinds: ["LinearRef", TICKET_KIND, "Json"],
        optional: true,
        primary: true,
      },
      { name: "body", kinds: ["Markdown", "Text", "Json"], optional: true },
    ]);
    expect(spec.outputs.map((o) => ({ name: o.name, kind: o.kind }))).toEqual([
      { name: "ticket", kind: TICKET_KIND },
    ]);
  });
});

describe("linear.comment runner — run", () => {
  it("posts the body from the `body` port on the ref ticket and emits the updated ticket", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async addComment(ref, body) {
        calls.push({ ref, body });
        return buildGatewayTicket({
          identifier: ref,
          comments: [{ author: "workflow", body, createdAt: "2026-01-03" }],
        });
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
          port: "body",
          kind: "Markdown",
          content: "## Diagnostic\n\nRoot cause + fix.",
          payload: { format: "markdown", body: "## Diagnostic\n\nRoot cause + fix." },
          artifactId: "a-body",
        },
      ],
      step: { kind: "linear.comment" },
      store,
      linear,
    });
    const outcome = await createLinearCommentRunner().run(ctx);
    expect(calls).toEqual([
      { ref: "ENG-9", body: "## Diagnostic\n\nRoot cause + fix." },
    ]);
    expect(outcome.kind).toBe("produced");
    expect(outcome.artifact.kind).toBe(TICKET_KIND);

    const persisted = store.all();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].metadata.commentCount).toBe("1");
    expect(persisted[0].metadata.payloadFormat).toBe("json-v1");
  });

  it("derives the ref from a triage Json envelope and the body from config", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async addComment(ref, body) {
        calls.push({ ref, body });
        return buildGatewayTicket({ identifier: ref });
      },
    };
    const ctx = buildCtx({
      inputs: [
        {
          port: "ref",
          kind: "Json",
          content: JSON.stringify({
            format: "json",
            body: JSON.stringify([{ identifier: "ENG-42", title: "Triaged" }]),
          }),
          payload: {
            format: "json",
            body: JSON.stringify([{ identifier: "ENG-42", title: "Triaged" }]),
          },
          artifactId: "a-json",
        },
      ],
      step: { kind: "linear.comment", config: { body: "Fixed in main." } },
      store,
      linear,
    });
    await createLinearCommentRunner().run(ctx);
    expect(calls).toEqual([{ ref: "ENG-42", body: "Fixed in main." }]);
  });

  it("throws when no body can be resolved", async () => {
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
      step: { kind: "linear.comment", config: {} },
      store: createStubArtifactStore(),
      linear: {
        async addComment() {
          throw new Error("unreachable");
        },
      },
    });
    await expect(createLinearCommentRunner().run(ctx)).rejects.toThrow(
      /requires a comment body/,
    );
  });

  it("throws when no ref can be resolved", async () => {
    const ctx = buildCtx({
      inputs: [
        {
          port: "body",
          kind: "Markdown",
          content: "Some report",
          payload: { format: "markdown", body: "Some report" },
          artifactId: "a-body",
        },
      ],
      step: { kind: "linear.comment", config: {} },
      store: createStubArtifactStore(),
      linear: {
        async addComment() {
          throw new Error("unreachable");
        },
      },
    });
    await expect(createLinearCommentRunner().run(ctx)).rejects.toThrow(
      /requires a ticket ref/,
    );
  });
});

describe("linear.triage.fetch runner — resolveSpec", () => {
  it("declares an optional trigger input and one Json tickets output", () => {
    const spec = createLinearTriageFetchRunner().resolveSpec();
    expect(spec.inputs).toEqual([
      { name: "trigger", kinds: ["*"], optional: true },
    ]);
    expect(spec.outputs.map((o) => ({ name: o.name, kind: o.kind }))).toEqual([
      { name: "tickets", kind: "Json" },
    ]);
  });
});

describe("linear.triage.fetch runner — run", () => {
  it("defaults to limit 10 and emits the triage tickets as a JSON array", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async fetchTriageTickets(limit) {
        calls.push(limit);
        return [
          buildGatewayTicket({
            identifier: "ENG-3",
            createdAt: "2026-03-03",
            description: "Full ask for ENG-3",
          }),
          buildGatewayTicket({ identifier: "ENG-2", createdAt: "2026-02-02" }),
        ];
      },
    };
    const ctx = buildCtx({
      inputs: [],
      step: { kind: "linear.triage.fetch", config: {} },
      store,
      linear,
    });
    const outcome = await createLinearTriageFetchRunner().run(ctx);
    expect(calls).toEqual([10]);
    expect(outcome.kind).toBe("produced");
    expect(outcome.artifact.kind).toBe("Json");

    const persisted = store.all();
    expect(persisted).toHaveLength(1);
    const envelope = JSON.parse(persisted[0].content);
    expect(envelope.format).toBe("json");
    const items = JSON.parse(envelope.body);
    expect(items.map((t) => t.identifier)).toEqual(["ENG-3", "ENG-2"]);
    // Compact projection: keeps triage fields incl. description, drops the
    // heavy comments blob.
    expect(items[0]).toMatchObject({
      identifier: "ENG-3",
      title: "Some ticket",
      description: "Full ask for ENG-3",
      state: "In Progress",
      priorityLabel: "High",
    });
    expect(items[0]).not.toHaveProperty("comments");
    expect(persisted[0].metadata.count).toBe("2");
    expect(persisted[0].metadata.limit).toBe("10");
    expect(persisted[0].metadata.source).toBe("linear.triage.fetch");
    expect(persisted[0].metadata.payloadFormat).toBe("json-v1");
  });

  it("passes a clamped config.limit through to the gateway", async () => {
    const store = createStubArtifactStore();
    const calls = [];
    const linear = {
      async fetchTriageTickets(limit) {
        calls.push(limit);
        return [];
      },
    };
    const ctx = buildCtx({
      inputs: [],
      step: { kind: "linear.triage.fetch", config: { limit: 999 } },
      store,
      linear,
    });
    const outcome = await createLinearTriageFetchRunner().run(ctx);
    expect(calls).toEqual([250]); // clamped to Linear's page max
    expect(outcome.artifact.kind).toBe("Json");
    const envelope = JSON.parse(store.all()[0].content);
    expect(JSON.parse(envelope.body)).toEqual([]);
    expect(store.all()[0].metadata.count).toBe("0");
  });

  it("coerces a string limit and falls back to 10 when invalid", async () => {
    const seen = [];
    const linear = {
      async fetchTriageTickets(limit) {
        seen.push(limit);
        return [];
      },
    };
    const run = (config) =>
      createLinearTriageFetchRunner().run(
        buildCtx({
          inputs: [],
          step: { kind: "linear.triage.fetch", config },
          store: createStubArtifactStore(),
          linear,
        }),
      );
    await run({ limit: "5" });
    await run({ limit: "abc" });
    await run({});
    expect(seen).toEqual([5, 10, 10]);
  });

  it("returns an empty images array for tickets without embedded images", async () => {
    const store = createStubArtifactStore();
    const linear = {
      async fetchTriageTickets() {
        return [buildGatewayTicket({ identifier: "ENG-1", description: "No pictures here." })];
      },
      async fetchImage() {
        throw new Error("fetchImage should not be called");
      },
    };
    const ctx = buildCtx({
      inputs: [],
      step: { kind: "linear.triage.fetch", config: {} },
      store,
      linear,
    });
    await createLinearTriageFetchRunner().run(ctx);
    const items = JSON.parse(JSON.parse(store.all()[0].content).body);
    expect(items[0].images).toEqual([]);
    expect(store.all()[0].metadata.imageCount).toBe("0");
  });

  it("downloads description images and attaches them (base64 + mime) to each item", async () => {
    const store = createStubArtifactStore();
    const requested = [];
    const linear = {
      async fetchTriageTickets() {
        return [
          buildGatewayTicket({
            identifier: "ENG-7",
            description:
              'Repro:\n\n![before](https://uploads.linear.app/a/before.png)\n\n<img src="https://uploads.linear.app/a/after.jpg">',
          }),
        ];
      },
      async fetchImage(url) {
        requested.push(url);
        return {
          url,
          mimeType: url.endsWith(".jpg") ? "image/jpeg" : "image/png",
          dataBase64: `b64:${url}`,
          byteLength: 3,
        };
      },
    };
    const ctx = buildCtx({
      inputs: [],
      step: { kind: "linear.triage.fetch", config: {} },
      store,
      linear,
    });
    await createLinearTriageFetchRunner().run(ctx);

    expect(requested).toEqual([
      "https://uploads.linear.app/a/before.png",
      "https://uploads.linear.app/a/after.jpg",
    ]);
    const items = JSON.parse(JSON.parse(store.all()[0].content).body);
    expect(items[0].images).toEqual([
      {
        url: "https://uploads.linear.app/a/before.png",
        altText: "before",
        mimeType: "image/png",
        byteLength: 3,
        dataBase64: "b64:https://uploads.linear.app/a/before.png",
      },
      {
        url: "https://uploads.linear.app/a/after.jpg",
        altText: "",
        mimeType: "image/jpeg",
        byteLength: 3,
        dataBase64: "b64:https://uploads.linear.app/a/after.jpg",
      },
    ]);
    expect(store.all()[0].metadata.imageCount).toBe("2");
  });

  it("keeps an error marker (and the run) when a single image download fails", async () => {
    const store = createStubArtifactStore();
    const warnings = [];
    const linear = {
      async fetchTriageTickets() {
        return [
          buildGatewayTicket({
            identifier: "ENG-8",
            description:
              "![ok](https://uploads.linear.app/ok.png) ![bad](https://uploads.linear.app/bad.png)",
          }),
        ];
      },
      async fetchImage(url) {
        if (url.includes("bad")) throw new Error("HTTP 404");
        return { url, mimeType: "image/png", dataBase64: "ok", byteLength: 2 };
      },
    };
    const ctx = buildCtx({
      inputs: [],
      step: { kind: "linear.triage.fetch", config: {} },
      store,
      linear,
    });
    ctx.deps.logger = { warn: (m) => warnings.push(m) };

    const outcome = await createLinearTriageFetchRunner().run(ctx);
    expect(outcome.kind).toBe("produced");
    const items = JSON.parse(JSON.parse(store.all()[0].content).body);
    expect(items[0].images).toEqual([
      {
        url: "https://uploads.linear.app/ok.png",
        altText: "ok",
        mimeType: "image/png",
        byteLength: 2,
        dataBase64: "ok",
      },
      {
        url: "https://uploads.linear.app/bad.png",
        altText: "bad",
        error: "HTTP 404",
      },
    ]);
    // Both images still counted (a failed download is a recorded item, not a drop).
    expect(store.all()[0].metadata.imageCount).toBe("2");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("bad.png");
  });
});

describe("extractDescriptionImageRefs", () => {
  it("extracts markdown images, strips titles, and captures alt text", () => {
    expect(
      extractDescriptionImageRefs(
        'text ![alt one](https://x/a.png) more ![](https://x/b.png "a title")',
      ),
    ).toEqual([
      { url: "https://x/a.png", altText: "alt one" },
      { url: "https://x/b.png", altText: "" },
    ]);
  });

  it("extracts HTML <img> sources", () => {
    expect(
      extractDescriptionImageRefs('<img alt="x" src="https://x/c.gif" width="10">'),
    ).toEqual([{ url: "https://x/c.gif", altText: "" }]);
  });

  it("de-duplicates by URL, preserving first-seen order", () => {
    expect(
      extractDescriptionImageRefs(
        "![one](https://x/a.png) ![two](https://x/a.png)",
      ),
    ).toEqual([{ url: "https://x/a.png", altText: "one" }]);
  });

  it("returns [] for empty or non-string descriptions", () => {
    expect(extractDescriptionImageRefs("")).toEqual([]);
    expect(extractDescriptionImageRefs(undefined)).toEqual([]);
    expect(extractDescriptionImageRefs(null)).toEqual([]);
  });
});
