import { describe, expect, it } from "vitest";
import {
  asArtifactHash,
  asArtifactId,
  asSkillRef,
  asStepExecId,
  asStepId,
  asWorkflowId,
  type SkillRef,
} from "../domain/ids";
import type { Artifact, ArtifactKind } from "../domain/artifact";
import type { ArtifactStore } from "../application/ports/outbound/artifact-store";
import type { SkillRegistry } from "../application/ports/outbound/skill-registry";
import type { Skill } from "../domain/skill";
import type { RunContext, RunContextInput } from "../application/step-runner";
import { createSkillLoaderRunner } from "./skill-loader";

type StoredArtifact = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & {
  all: () => ReadonlyArray<StoredArtifact>;
};

const createStubArtifactStore = (): StubStore => {
  const stored: StoredArtifact[] = [];
  let counter = 0;
  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      counter += 1;
      stored.push({ kind, content, metadata });
      return {
        id: asArtifactId(`artifact-${counter}`),
        kind,
        hash: asArtifactHash(`hash-${counter}`),
        storageRef: "stub",
        metadata,
        createdAt: "2026-06-16T00:00:00.000Z",
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

const createStubSkills = (bodies: Record<string, string>): SkillRegistry => ({
  async resolve(ref: SkillRef): Promise<Skill> {
    const body = bodies[String(ref)];
    if (body === undefined) throw new Error(`skill not found: ${ref}`);
    return { ref, body, meta: {} };
  },
  async list() {
    return Object.entries(bodies).map(([ref, body]) => ({
      ref: asSkillRef(ref),
      body,
      meta: {},
    }));
  },
  async save() {},
  async remove() {},
});

const md = (port: string, body: string): RunContextInput => ({
  port,
  kind: "Markdown",
  content: JSON.stringify({ format: "markdown", body }),
  payload: { format: "markdown", body },
  artifactId: asArtifactId(`artifact-${port}`),
});

const json = (port: string, body: string): RunContextInput => ({
  port,
  kind: "Json",
  content: JSON.stringify({ format: "json", body }),
  payload: { format: "json", body },
  artifactId: asArtifactId(`artifact-${port}`),
});

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  inputs: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
  skills?: SkillRegistry;
  readsFrom?: Readonly<Record<string, string>>;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-skill"),
  step: {
    id: asStepId("step-skill"),
    name: "skill",
    kind: "skill.loader",
    actorRole: "Developer",
    config: params.config,
    humanGateRequired: false,
    readsFrom: params.readsFrom,
  },
  inputs: params.inputs,
  loopHistory: [],
  attempt: 0,
  workspace: {},
  deps: {
    artifactStore: params.store,
    skills: params.skills,
    llm: undefined as never,
    linear: undefined as never,
    shell: undefined as never,
    runLog: undefined as never,
    clock: undefined as never,
    ids: undefined as never,
    llmSession: undefined as never,
    logger: undefined as never,
    hash: undefined as never,
    path: undefined as never,
    environment: undefined as never,
    fs: undefined as never,
  },
});

const bodyOfStored = (stored: StoredArtifact): string =>
  (JSON.parse(stored.content) as { body: string }).body;

describe("skill.loader — resolveSpec (dynamic ports)", () => {
  it("derives one optional Markdown|Json input port per placeholder, in order, deduped", () => {
    const runner = createSkillLoaderRunner({
      getSkillBody: () => "Analyse {{spec}} selon {{style}} et {{spec}} encore.",
    });
    const spec = runner.resolveSpec({ config: { skillRef: "s@v1" } });
    expect(spec.inputs).toEqual([
      { name: "in", kinds: ["*"], optional: true },
      { name: "spec", kinds: ["Markdown", "Json"], optional: true },
      { name: "style", kinds: ["Markdown", "Json"], optional: true },
    ]);
    expect(spec.outputs).toEqual([
      { name: "out", kind: "Markdown", primary: true },
    ]);
  });

  it("keeps the `in` chaining port and a single Markdown `out`", () => {
    const runner = createSkillLoaderRunner({ getSkillBody: () => "no vars" });
    const spec = runner.resolveSpec({ config: { skillRef: "s@v1" } });
    expect(spec.inputs).toEqual([{ name: "in", kinds: ["*"], optional: true }]);
  });

  it("falls back to the permissive `in`-only signature when no skillRef is set (catalogue)", () => {
    const runner = createSkillLoaderRunner({ getSkillBody: () => "x {{y}}" });
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.inputs).toEqual([{ name: "in", kinds: ["*"], optional: true }]);
  });

  it("on a snapshot miss, preserves bindings by declaring a port per readsFrom key", () => {
    const runner = createSkillLoaderRunner({ getSkillBody: () => undefined });
    const spec = runner.resolveSpec({
      config: { skillRef: "s@v1" },
      readsFrom: { spec: "specVar", style: "styleVar" },
    });
    expect(spec.inputs).toEqual([
      { name: "in", kinds: ["*"], optional: true },
      { name: "spec", kinds: ["Markdown", "Json"], optional: true },
      { name: "style", kinds: ["Markdown", "Json"], optional: true },
    ]);
  });

  it("on a snapshot miss with no readsFrom, degrades to the permissive signature", () => {
    const runner = createSkillLoaderRunner({ getSkillBody: () => undefined });
    const spec = runner.resolveSpec({ config: { skillRef: "s@v1" } });
    expect(spec.inputs).toEqual([{ name: "in", kinds: ["*"], optional: true }]);
  });

  it("lets a literal {{in}} placeholder shadow the chaining port", () => {
    const runner = createSkillLoaderRunner({ getSkillBody: () => "{{in}} {{x}}" });
    const spec = runner.resolveSpec({ config: { skillRef: "s@v1" } });
    expect(spec.inputs).toEqual([
      { name: "in", kinds: ["Markdown", "Json"], optional: true },
      { name: "x", kinds: ["Markdown", "Json"], optional: true },
    ]);
  });
});

describe("skill.loader — run (substitution)", () => {
  const runner = createSkillLoaderRunner();

  it("substitutes a single placeholder from its port (key = port = placeholder)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { skillRef: "s@v1" },
      inputs: [md("spec", "the spec body")],
      store,
      skills: createStubSkills({ "s@v1": "Analyse {{spec}}." }),
      readsFrom: { spec: "specVar" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("Analyse the spec body.");
    expect(store.all()[0].kind).toBe("Markdown");
    expect(store.all()[0].metadata).toMatchObject({ source: "skill.loader" });
  });

  it("substitutes multiple placeholders, including a Json fragment", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { skillRef: "s@v1" },
      inputs: [md("spec", "S"), json("style", '{"tone":"dry"}')],
      store,
      skills: createStubSkills({ "s@v1": "{{spec}} :: {{style}}" }),
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe('S :: {"tone":"dry"}');
  });

  it("drops an unwired placeholder by default (onMissing=empty)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { skillRef: "s@v1" },
      inputs: [md("spec", "S")],
      store,
      skills: createStubSkills({ "s@v1": "[{{spec}}][{{absent}}]" }),
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("[S][]");
    expect(store.all()[0].metadata.missing).toBe("absent");
  });

  it("keeps an unwired placeholder literal under config.onMissing=keep", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { skillRef: "s@v1", onMissing: "keep" },
      inputs: [md("spec", "S")],
      store,
      skills: createStubSkills({ "s@v1": "{{spec}} {{absent}}" }),
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("S {{absent}}");
  });

  it("fails the run under config.onMissing=error when a placeholder is unwired", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { skillRef: "s@v1", onMissing: "error" },
      inputs: [md("spec", "S")],
      store,
      skills: createStubSkills({ "s@v1": "{{spec}} {{absent}}" }),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/\{\{absent\}\}/);
  });

  it("does not substitute the chaining `in` port (a literal {{in}} is dropped)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { skillRef: "s@v1" },
      inputs: [md("in", "CHAIN")],
      store,
      skills: createStubSkills({ "s@v1": "X {{in}} Y" }),
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("X  Y");
  });

  it("emits a body with no placeholder verbatim (legacy behaviour)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { skillRef: "s@v1" },
      inputs: [],
      store,
      skills: createStubSkills({ "s@v1": "Just a plain prompt." }),
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("Just a plain prompt.");
  });

  it("throws when skillRef is missing", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {},
      inputs: [],
      store,
      skills: createStubSkills({}),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/skillRef/);
  });
});
