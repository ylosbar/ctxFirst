import { describe, expect, it, vi } from "vitest";
import {
  asArtifactHash,
  asArtifactId,
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../domain/ids";
import type { Artifact, ArtifactKind } from "../domain/artifact";
import type { ArtifactStore } from "../application/ports/outbound/artifact-store";
import type { EnvironmentPort } from "../application/ports/outbound/environment";
import type { PathPort } from "../application/ports/outbound/path";
import type {
  ShellGateway,
  ShellRunRequest,
  ShellRunResult,
} from "../application/ports/outbound/shell-gateway";
import type { RunContext, StepOutcome } from "../application/step-runner";
import { createGitCloneRunner } from "./git-clone";
import { redactToken, rmrfContained, runGitClone } from "./git-exec";

// --- Stubs (mirror git-exec.test.ts) -------------------------------------

const stubPath: PathPort = {
  resolve(...segments) {
    let acc = "";
    for (const raw of segments) {
      if (!raw || raw.length === 0) continue;
      acc = raw.startsWith("/") ? raw : acc.length === 0 ? raw : `${acc}/${raw}`;
    }
    if (!acc.startsWith("/")) acc = "/" + acc;
    const parts = acc.split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (p === "" || p === ".") continue;
      if (p === "..") out.pop();
      else out.push(p);
    }
    return "/" + out.join("/");
  },
  sep: "/",
};

const stubEnvironment = (
  vars: Record<string, string> = {},
): EnvironmentPort => ({
  read(keys) {
    const out: Record<string, string> = {};
    for (const k of keys) {
      if (k in vars) out[k] = vars[k];
      else if (k === "PATH") out[k] = "/usr/bin";
    }
    return out;
  },
});

type StoredArtifact = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & {
  last: () => StoredArtifact | null;
};

const createStubStore = (): StubStore => {
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
        createdAt: "2026-05-24T00:00:00.000Z",
      };
    },
    async get() {
      throw new Error("not implemented");
    },
    async getByHash() {
      return null;
    },
    last: () => (stored.length > 0 ? stored[stored.length - 1] : null),
  };
};

type ScriptedShell = {
  gateway: ShellGateway;
  calls: ShellRunRequest[];
  argvs: () => ReadonlyArray<ReadonlyArray<string>>;
};

const ok = (overrides: Partial<ShellRunResult> = {}): ShellRunResult => ({
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  truncated: { stdout: false, stderr: false },
  durationMs: 1,
  ...overrides,
});

const createScriptedShell = (
  responses: ReadonlyArray<
    ShellRunResult | ((req: ShellRunRequest) => ShellRunResult)
  >,
): ScriptedShell => {
  const calls: ShellRunRequest[] = [];
  let i = 0;
  const gateway: ShellGateway = {
    async run(req) {
      calls.push(req);
      if (i >= responses.length) {
        throw new Error(
          `scripted shell exhausted; unexpected call #${calls.length}: ${JSON.stringify(req.command)}`,
        );
      }
      const r = responses[i++];
      return typeof r === "function" ? r(req) : r;
    },
  };
  return {
    gateway,
    calls,
    argvs: () =>
      calls.map((c) =>
        Array.isArray(c.command) ? [...c.command] : [String(c.command)],
      ),
  };
};

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  shell: ShellGateway;
  store: ArtifactStore;
  env?: Record<string, string>;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "git.clone",
    kind: "git.clone",
    actorRole: "Developer",
    config: params.config,
    humanGateRequired: false,
  },
  inputs: [],
  loopHistory: [],
  attempt: 0,
  workspace: {},
  deps: {
    artifactStore: params.store,
    shell: params.shell,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    path: stubPath,
    environment: stubEnvironment(params.env),
    llm: undefined as never,
    linear: undefined as never,
    runLog: undefined as never,
    clock: undefined as never,
    ids: undefined as never,
    llmSession: undefined as never,
    hash: undefined as never,
    fs: undefined as never,
  },
});

// =========================================================================
// Helpers
// =========================================================================

describe("redactToken", () => {
  it("redacts oauth2 token in an authenticated URL", () => {
    expect(
      redactToken("https://oauth2:glpat-XXX@gitlab.com/g/p.git"),
    ).toBe("https://oauth2:***@gitlab.com/g/p.git");
  });

  it("redacts x-access-token (GitHub) token", () => {
    expect(
      redactToken("https://x-access-token:ghp_SECRET@github.com/g/p.git"),
    ).toBe("https://x-access-token:***@github.com/g/p.git");
  });

  it("leaves a token-less URL unchanged", () => {
    expect(redactToken("https://gitlab.com/g/p.git")).toBe(
      "https://gitlab.com/g/p.git",
    );
  });

  it("scrubs a token buried in a stderr tail", () => {
    const tail =
      "fatal: unable to access 'https://oauth2:glpat-XXX@gitlab.com/g/p.git/'";
    expect(redactToken(tail)).not.toContain("glpat-XXX");
    expect(redactToken(tail)).toContain("oauth2:***@");
  });
});

describe("rmrfContained", () => {
  it("rejects a target outside base (G2)", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {},
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(
      rmrfContained(ctx, "/base", "/other/place"),
    ).rejects.toThrow(/escapes/);
    expect(shell.calls).toHaveLength(0);
  });

  it("refuses to rm the baseDir itself", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {},
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(rmrfContained(ctx, "/base", "/base")).rejects.toThrow(
      /baseDir itself/,
    );
    expect(shell.calls).toHaveLength(0);
  });

  it("runs `rm -rf <target>` in useShell:false on the nominal path", async () => {
    const shell = createScriptedShell([ok()]);
    const ctx = buildCtx({
      config: {},
      shell: shell.gateway,
      store: createStubStore(),
    });
    await rmrfContained(ctx, "/base", "/base/project");
    expect(shell.argvs()).toEqual([["rm", "-rf", "/base/project"]]);
    expect(shell.calls[0].useShell).toBe(false);
    expect(shell.calls[0].cwd).toBe("/base");
  });
});

describe("runGitClone", () => {
  it("builds the argv with --branch/--single-branch and rewrites origin without the token", async () => {
    const shell = createScriptedShell([
      ok(), // git clone
      ok(), // git remote set-url
    ]);
    const ctx = buildCtx({
      config: {},
      shell: shell.gateway,
      store: createStubStore(),
    });
    await runGitClone(ctx, {
      repoUrl: "https://gitlab.com/g/p.git",
      dest: "/base/p",
      cwd: "/base",
      branch: "x",
      token: "glpat-XXX",
    });
    expect(shell.argvs()).toEqual([
      [
        "git",
        "clone",
        "--branch",
        "x",
        "--single-branch",
        "https://oauth2:glpat-XXX@gitlab.com/g/p.git",
        "/base/p",
      ],
      ["git", "remote", "set-url", "origin", "https://gitlab.com/g/p.git"],
    ]);
    // The persisted origin URL must not carry the token.
    expect(shell.argvs()[1]).not.toContain(
      "https://oauth2:glpat-XXX@gitlab.com/g/p.git",
    );
  });

  it("clones anonymously (no token) and skips the origin rewrite", async () => {
    const shell = createScriptedShell([ok()]);
    const ctx = buildCtx({
      config: {},
      shell: shell.gateway,
      store: createStubStore(),
    });
    await runGitClone(ctx, {
      repoUrl: "https://gitlab.com/g/p.git",
      dest: "/base/p",
      cwd: "/base",
    });
    expect(shell.argvs()).toEqual([
      ["git", "clone", "https://gitlab.com/g/p.git", "/base/p"],
    ]);
  });

  it("throws on a non-zero exit with a redacted message", async () => {
    const shell = createScriptedShell([
      ok({
        exitCode: 128,
        stderr:
          "fatal: unable to access 'https://oauth2:glpat-XXX@gitlab.com/g/p.git/'",
      }),
    ]);
    const ctx = buildCtx({
      config: {},
      shell: shell.gateway,
      store: createStubStore(),
    });
    const err = await runGitClone(ctx, {
      repoUrl: "https://gitlab.com/g/p.git",
      dest: "/base/p",
      cwd: "/base",
      token: "glpat-XXX",
    }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/oauth2:\*\*\*@/);
    expect(err.message).not.toContain("glpat-XXX");
  });
});

// =========================================================================
// Runner git.clone
// =========================================================================

describe("git.clone runner", () => {
  const runner = createGitCloneRunner({
    getAccessToken: () => "glpat-TOKEN",
    defaultBaseDir: "/managed/clones",
  });

  it("golden path cleanBefore:true → rm -rf, clone, then Path artifact", async () => {
    const shell = createScriptedShell([
      ok(), // rm -rf
      ok(), // git clone
      ok(), // git remote set-url
    ]);
    const store = createStubStore();
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/group/project.git",
        baseDir: "/clones",
        folder: "group/project",
        cleanBefore: true,
      },
      shell: shell.gateway,
      store,
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.kind).toBe("produced");

    expect(shell.argvs()[0]).toEqual([
      "rm",
      "-rf",
      "/clones/group/project",
    ]);
    expect(shell.argvs()[1]).toEqual([
      "git",
      "clone",
      "https://oauth2:glpat-TOKEN@gitlab.com/group/project.git",
      "/clones/group/project",
    ]);
    expect(shell.calls[1].cwd).toBe("/clones");

    expect(store.last()?.kind).toBe("Path");
    expect(JSON.parse(store.last()!.content)).toEqual({
      path: "/clones/group/project",
    });
    // Metadata URL is redacted (token never persisted).
    expect(store.last()?.metadata.repoUrl).toBe(
      "https://gitlab.com/group/project.git",
    );
  });

  it("falls back to the managed default baseDir when blank", async () => {
    const shell = createScriptedShell([ok(), ok(), ok()]);
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/g/p.git",
        baseDir: "",
        folder: "p",
        cleanBefore: true,
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await runner.run(ctx);
    expect(shell.argvs()[0]).toEqual(["rm", "-rf", "/managed/clones/p"]);
  });

  it("cleanBefore:false clones when the target is absent", async () => {
    const shell = createScriptedShell([
      ok({ exitCode: 2, stderr: "ls: no such file" }), // ls -A → absent
      ok(), // git clone
      ok(), // remote set-url
    ]);
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/g/p.git",
        baseDir: "/clones",
        folder: "p",
        cleanBefore: false,
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await runner.run(ctx);
    expect(shell.argvs()[0]).toEqual(["ls", "-A", "/clones/p"]);
    expect(shell.argvs()[1][0]).toBe("git");
    expect(shell.argvs()[1][1]).toBe("clone");
  });

  it("cleanBefore:false throws when the target exists and is non-empty", async () => {
    const shell = createScriptedShell([
      ok({ stdout: ".git\nREADME.md\n" }), // ls -A → non-empty
    ]);
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/g/p.git",
        baseDir: "/clones",
        folder: "p",
        cleanBefore: false,
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/exists and is not empty/);
  });

  it("rejects a non-HTTPS repoUrl", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {
        repoUrl: "git@gitlab.com:g/p.git",
        baseDir: "/clones",
        folder: "p",
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/https:\/\//);
    expect(shell.calls).toHaveLength(0);
  });

  it("rejects an empty repoUrl", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: { repoUrl: "", baseDir: "/clones", folder: "p" },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/repoUrl/);
  });

  it("rejects a folder containing ..", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/g/p.git",
        baseDir: "/clones",
        folder: "../escape",
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/\.\./);
    expect(shell.calls).toHaveLength(0);
  });

  it("rejects an invalid branch (G7)", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/g/p.git",
        baseDir: "/clones",
        folder: "p",
        branch: "-bad",
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/must not start with/);
  });

  it("falls back to GITLAB_TOKEN env when no resolver token is available", async () => {
    const runnerNoResolver = createGitCloneRunner({
      defaultBaseDir: "/managed/clones",
    });
    const shell = createScriptedShell([ok(), ok(), ok()]);
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/g/p.git",
        baseDir: "/clones",
        folder: "p",
        cleanBefore: true,
      },
      shell: shell.gateway,
      store: createStubStore(),
      env: { GITLAB_TOKEN: "env-token" },
    });
    await runnerNoResolver.run(ctx);
    expect(shell.argvs()[1]).toContain(
      "https://oauth2:env-token@gitlab.com/g/p.git",
    );
  });

  it("clones anonymously when no token is available (public repo)", async () => {
    const runnerNoResolver = createGitCloneRunner({
      defaultBaseDir: "/managed/clones",
    });
    const shell = createScriptedShell([ok(), ok()]); // rm + clone (no set-url)
    const ctx = buildCtx({
      config: {
        repoUrl: "https://gitlab.com/g/p.git",
        baseDir: "/clones",
        folder: "p",
        cleanBefore: true,
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await runnerNoResolver.run(ctx);
    expect(shell.argvs()).toEqual([
      ["rm", "-rf", "/clones/p"],
      ["git", "clone", "https://gitlab.com/g/p.git", "/clones/p"],
    ]);
  });
});
