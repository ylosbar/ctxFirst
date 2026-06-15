import { describe, expect, it } from "vitest";
import { asArtifactId, asStepExecId, asStepId, asWorkflowId } from "../domain/ids";
import type { ArtifactKind } from "../domain/artifact";
import type {
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { createWorkspaceSetRunner } from "./workspace-set";

const runner = createWorkspaceSetRunner();

/** Builds a `Path` input as the orchestrator delivers it on the `in` port. */
const pathInput = (
  path: string,
  opts: { degraded?: boolean; kind?: ArtifactKind } = {},
): RunContextInput => ({
  port: "in",
  kind: opts.kind ?? "Path",
  content: JSON.stringify({ path }),
  payload: opts.degraded ? null : { path },
  artifactId: asArtifactId("art-1"),
});

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  inputs?: ReadonlyArray<RunContextInput>;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("workspace-set-1"),
  step: {
    id: asStepId("workspace-set-1"),
    name: "Workspace Set",
    kind: "workspace.set",
    actorRole: "Developer",
    config: params.config,
    humanGateRequired: false,
  },
  inputs: params.inputs ?? [],
  loopHistory: [],
  attempt: 0,
  workspace: {},
  deps: {} as never,
});

const expectWorkspaceSet = (outcome: StepOutcome): { cwd: string } => {
  expect(outcome.kind).toBe("workspace-set");
  return outcome as Extract<StepOutcome, { kind: "workspace-set" }>;
};

describe("workspace.set — cwd resolution", () => {
  it("uses the literal config.cwd when set", async () => {
    const ctx = buildCtx({ config: { cwd: "/tmp/ws" } });
    expect(expectWorkspaceSet(await runner.run(ctx)).cwd).toBe("/tmp/ws");
  });

  it("trims a whitespace-padded config.cwd", async () => {
    const ctx = buildCtx({ config: { cwd: "  /tmp/ws  " } });
    expect(expectWorkspaceSet(await runner.run(ctx)).cwd).toBe("/tmp/ws");
  });

  it("falls back to a wired Path artifact when config.cwd is empty", async () => {
    const ctx = buildCtx({
      config: { cwd: "" },
      inputs: [pathInput("/clones/getfluence/product-launchpad")],
    });
    expect(expectWorkspaceSet(await runner.run(ctx)).cwd).toBe(
      "/clones/getfluence/product-launchpad",
    );
  });

  it("reads the Path from raw JSON content when the payload is degraded", async () => {
    const ctx = buildCtx({
      config: { cwd: "" },
      inputs: [pathInput("/clones/repo", { degraded: true })],
    });
    expect(expectWorkspaceSet(await runner.run(ctx)).cwd).toBe("/clones/repo");
  });

  it("prefers config.cwd over a wired Path input", async () => {
    const ctx = buildCtx({
      config: { cwd: "/explicit" },
      inputs: [pathInput("/from-input")],
    });
    expect(expectWorkspaceSet(await runner.run(ctx)).cwd).toBe("/explicit");
  });

  it("ignores non-Path inputs and picks the first Path", async () => {
    const ctx = buildCtx({
      config: { cwd: "" },
      inputs: [
        { ...pathInput(""), kind: "Markdown", content: "# chaining only" },
        pathInput("/clones/repo"),
      ],
    });
    expect(expectWorkspaceSet(await runner.run(ctx)).cwd).toBe("/clones/repo");
  });

  it("throws when neither config.cwd nor a Path input is present", async () => {
    const ctx = buildCtx({ config: { cwd: "" } });
    await expect(runner.run(ctx)).rejects.toThrow(/step\.config\.cwd/);
  });

  it("throws when the only input is a non-Path artifact", async () => {
    const ctx = buildCtx({
      config: {},
      inputs: [{ ...pathInput("/ignored"), kind: "Markdown" }],
    });
    await expect(runner.run(ctx)).rejects.toThrow(/Path. artifact wired/);
  });
});
