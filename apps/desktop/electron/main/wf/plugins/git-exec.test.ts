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
import type {
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { createGitCommitPushRunner } from "./git-commit-push";
import { createGitWorktreeCreateRunner } from "./git-worktree-create";
import { createGitWorktreeRemoveRunner } from "./git-worktree-remove";

// --- Stubs ---------------------------------------------------------------

const stubPath: PathPort = {
  resolve(...segments) {
    // Mirrors Node's POSIX `path.resolve`: an absolute segment restarts
    // the accumulator from that point on.
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

const stubEnvironment = (): EnvironmentPort => ({
  read(keys) {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = `STUB_${k}`;
    return out;
  },
});

type StoredArtifact = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & {
  all: () => ReadonlyArray<StoredArtifact>;
  last: () => StoredArtifact | null;
};

const createStubStore = (): StubStore => {
  const stored: StoredArtifact[] = [];
  let counter = 0;
  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      counter += 1;
      const entry = { kind, content, metadata };
      stored.push(entry);
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
    all: () => stored,
    last: () => (stored.length > 0 ? stored[stored.length - 1] : null),
  };
};

/**
 * Scripted shell that returns a queued result for every call. Each test
 * frames the exact sequence it expects, so a missing entry surfaces as an
 * explicit failure rather than a silent hang.
 */
type ScriptedShell = {
  gateway: ShellGateway;
  calls: ShellRunRequest[];
  /** Argv-arrays of every call, easier to assert against. */
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

const argvOf = (req: ShellRunRequest): ReadonlyArray<string> =>
  Array.isArray(req.command) ? [...req.command] : [String(req.command)];

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  shell: ShellGateway;
  store: ArtifactStore;
  cwd?: string;
  inputs?: ReadonlyArray<RunContextInput>;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "git",
    kind: "git.unit-test",
    actorRole: "Developer",
    config: params.config,
    humanGateRequired: false,
  },
  inputs: params.inputs ?? [],
  loopHistory: [],
  attempt: 0,
  workspace: { cwd: params.cwd },
  deps: {
    artifactStore: params.store,
    shell: params.shell,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    path: stubPath,
    environment: stubEnvironment(),
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
// git.worktree.create
// =========================================================================

describe("git.worktree.create — argv & outcomes", () => {
  const runner = createGitWorktreeCreateRunner();

  it("calls `git worktree add -b <branch> <path> <baseRef>` and emits workspace-set", async () => {
    const shell = createScriptedShell([ok()]);
    const store = createStubStore();
    const ctx = buildCtx({
      config: {
        repoDir: "/repo",
        branch: "wf/instance-123",
        baseRef: "origin/main",
      },
      shell: shell.gateway,
      store,
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "workspace-set" }
    >;

    expect(outcome.kind).toBe("workspace-set");
    expect(outcome.cwd).toBe("/repo/.worktrees/wf__instance-123");
    expect(shell.argvs()).toEqual([
      [
        "git",
        "worktree",
        "add",
        "-b",
        "wf/instance-123",
        "/repo/.worktrees/wf__instance-123",
        "origin/main",
      ],
    ]);
    expect(shell.calls[0].useShell).toBe(false);
    expect(shell.calls[0].cwd).toBe("/repo");
  });

  it("defaults `baseRef` to HEAD and `worktreesDir` to .worktrees", async () => {
    const shell = createScriptedShell([ok()]);
    const ctx = buildCtx({
      config: { repoDir: "/repo", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await runner.run(ctx);
    expect(shell.argvs()[0]).toEqual([
      "git",
      "worktree",
      "add",
      "-b",
      "feat",
      "/repo/.worktrees/feat",
      "HEAD",
    ]);
  });

  it("rejects a worktreesDir that escapes the repo (G2-git)", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {
        repoDir: "/repo",
        branch: "feat",
        worktreesDir: "../escape",
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/escapes/);
    expect(shell.calls).toHaveLength(0);
  });

  it.each([
    ["feat with space", /forbidden/],
    ["-leading-dash", /must not start with/],
    ["feat..bad", /\.\./],
    ["feat~bad", /forbidden/],
  ])("rejects invalid branch name %p (G7-git)", async (branch, msg) => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: { repoDir: "/repo", branch },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(msg);
    expect(shell.calls).toHaveLength(0);
  });

  it("returns workspace-set on replay when worktree already exists on the right branch", async () => {
    // First call: `worktree add` fails ("already exists" — we don't parse
    // the stderr). Second call: porcelain confirms the branch matches.
    const porcelain = `worktree /repo/.worktrees/feat\nHEAD abc\nbranch refs/heads/feat\n`;
    const shell = createScriptedShell([
      ok({ exitCode: 128, stderr: "fatal: '/repo/.worktrees/feat' already exists" }),
      ok({ stdout: porcelain }),
    ]);
    const ctx = buildCtx({
      config: { repoDir: "/repo", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "workspace-set" }
    >;
    expect(outcome.kind).toBe("workspace-set");
    expect(outcome.cwd).toBe("/repo/.worktrees/feat");
  });

  it("throws when an existing worktree tracks a different branch", async () => {
    const porcelain = `worktree /repo/.worktrees/feat\nHEAD abc\nbranch refs/heads/other\n`;
    const shell = createScriptedShell([
      ok({ exitCode: 128, stderr: "already exists" }),
      ok({ stdout: porcelain }),
    ]);
    const ctx = buildCtx({
      config: { repoDir: "/repo", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/tracks "other"/);
  });

  it("surfaces the original stderr when add fails for a non-replay reason", async () => {
    const shell = createScriptedShell([
      ok({ exitCode: 128, stderr: "fatal: invalid reference: bogus" }),
      ok({ stdout: "" }), // empty porcelain → no existing entry
    ]);
    const ctx = buildCtx({
      config: { repoDir: "/repo", branch: "feat", baseRef: "bogus" },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/invalid reference: bogus/);
  });
});

// =========================================================================
// git.commit_push
// =========================================================================

describe("git.commit_push — guards & configuration", () => {
  const runner = createGitCommitPushRunner();

  it("requires a workspace cwd", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {
        paths: ["src/"],
        message: "msg",
        branch: "feat",
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/workspace cwd/);
    expect(shell.calls).toHaveLength(0);
  });

  it("rejects empty `paths`", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: { paths: [], message: "msg", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
      cwd: "/wt",
    });
    await expect(runner.run(ctx)).rejects.toThrow(/non-empty array/);
  });

  it("rejects a path that starts with '-'", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: { paths: ["--evil"], message: "msg", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
      cwd: "/wt",
    });
    await expect(runner.run(ctx)).rejects.toThrow(/must not start with/);
  });

  it("rejects an invalid branch (G7-git)", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: { paths: ["src/"], message: "msg", branch: "bad branch" },
      shell: shell.gateway,
      store: createStubStore(),
      cwd: "/wt",
    });
    await expect(runner.run(ctx)).rejects.toThrow(/forbidden/);
  });
});

describe("git.commit_push — `nothing` port (idempotence)", () => {
  const runner = createGitCommitPushRunner();

  it("routes to `nothing` when the working tree is clean after add", async () => {
    const shell = createScriptedShell([
      ok(), // git add -- src/
      ok({ stdout: "" }), // git status --porcelain → clean
      ok({ stdout: "abc123\n" }), // git rev-parse HEAD
    ]);
    const store = createStubStore();
    const ctx = buildCtx({
      config: { paths: ["src/"], message: "msg", branch: "feat" },
      shell: shell.gateway,
      store,
      cwd: "/wt",
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-on-port" }
    >;
    expect(outcome.kind).toBe("produced-on-port");
    expect(outcome.port).toBe("nothing");

    // Only the three exploratory calls were made — no commit/fetch/push.
    expect(shell.argvs()).toEqual([
      ["git", "add", "--", "src/"],
      ["git", "status", "--porcelain"],
      ["git", "rev-parse", "HEAD"],
    ]);
    expect(store.last()?.metadata.port).toBe("nothing");
  });
});

describe("git.commit_push — `pushed` port (happy path)", () => {
  const runner = createGitCommitPushRunner();

  it("commits, fetches, rebases, and pushes with --force-with-lease", async () => {
    const shell = createScriptedShell([
      ok(), // add
      ok({ stdout: " M src/foo.ts\n" }), // status → dirty
      ok(), // commit
      ok(), // fetch
      ok(), // rebase
      ok(), // push
      ok({ stdout: "deadbeef\n" }), // rev-parse HEAD
    ]);
    const store = createStubStore();
    const ctx = buildCtx({
      config: {
        paths: ["src/foo.ts", "package.json"],
        message: "wf: changes",
        branch: "feat",
      },
      shell: shell.gateway,
      store,
      cwd: "/wt",
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-on-port" }
    >;
    expect(outcome.kind).toBe("produced-on-port");
    expect(outcome.port).toBe("pushed");

    expect(shell.argvs()).toEqual([
      ["git", "add", "--", "src/foo.ts", "package.json"],
      ["git", "status", "--porcelain"],
      ["git", "commit", "-m", "wf: changes"],
      ["git", "fetch", "origin", "feat"],
      ["git", "rebase", "--autostash", "origin/feat"],
      ["git", "push", "--force-with-lease", "origin", "feat"],
      ["git", "rev-parse", "HEAD"],
    ]);

    // G1-git: every recorded argv proves we never invoked `--force` nu.
    for (const argv of shell.argvs()) {
      expect(argv).not.toContain("--force");
    }
    // G4-git: `add -A` / `.` never appear.
    for (const argv of shell.argvs()) {
      if (argv[0] === "git" && argv[1] === "add") {
        expect(argv).not.toContain("-A");
        expect(argv).not.toContain(".");
        expect(argv).toContain("--");
      }
    }

    expect(store.last()?.metadata.port).toBe("pushed");
    expect(store.last()?.metadata.sha).toBe("deadbeef");
  });

  it("uses the Markdown input on `message` over config.message when both are present", async () => {
    const shell = createScriptedShell([
      ok(),
      ok({ stdout: " M f\n" }),
      ok(), // commit
      ok(), // fetch
      ok(), // rebase
      ok(), // push
      ok({ stdout: "sha\n" }),
    ]);
    const ctx = buildCtx({
      config: {
        paths: ["f"],
        message: "config message",
        branch: "feat",
      },
      shell: shell.gateway,
      store: createStubStore(),
      cwd: "/wt",
      inputs: [
        {
          port: "message",
          kind: "Markdown",
          content: JSON.stringify({ format: "markdown", body: "from input" }),
          payload: { format: "markdown", body: "from input" },
          artifactId: asArtifactId("in-1"),
        },
      ],
    });
    await runner.run(ctx);
    expect(shell.argvs()[2]).toEqual(["git", "commit", "-m", "from input"]);
  });
});

describe("git.commit_push — `conflict` port", () => {
  const runner = createGitCommitPushRunner();

  it("aborts the rebase and routes to `conflict` on conflict (G5-git)", async () => {
    const shell = createScriptedShell([
      ok(), // add
      ok({ stdout: " M f\n" }), // status
      ok(), // commit
      ok(), // fetch
      ok({ exitCode: 1, stderr: "CONFLICT (content): ..." }), // rebase fails
      ok(), // rebase --abort
      ok({ stdout: "sha\n" }), // rev-parse
    ]);
    const store = createStubStore();
    const ctx = buildCtx({
      config: { paths: ["f"], message: "m", branch: "feat" },
      shell: shell.gateway,
      store,
      cwd: "/wt",
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-on-port" }
    >;
    expect(outcome.kind).toBe("produced-on-port");
    expect(outcome.port).toBe("conflict");
    expect(shell.argvs()).toContainEqual(["git", "rebase", "--abort"]);
    expect(store.last()?.metadata.port).toBe("conflict");
  });
});

describe("git.commit_push — retries", () => {
  const runner = createGitCommitPushRunner();

  it("retries push on rejection and succeeds on the second attempt", async () => {
    const shell = createScriptedShell([
      ok(), // add
      ok({ stdout: " M f\n" }), // status
      ok(), // commit
      ok(), // fetch #1
      ok(), // rebase #1
      ok({ exitCode: 1, stderr: "stale info" }), // push #1 rejected
      ok(), // fetch #2
      ok(), // rebase #2
      ok(), // push #2 ok
      ok({ stdout: "sha\n" }), // rev-parse
    ]);
    const ctx = buildCtx({
      config: { paths: ["f"], message: "m", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
      cwd: "/wt",
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-on-port" }
    >;
    expect(outcome.port).toBe("pushed");
  });

  it("throws after exhausting maxRetries (G8-git)", async () => {
    const failingCycle: ShellRunResult[] = [
      ok(), // fetch
      ok(), // rebase
      ok({ exitCode: 1, stderr: "rejected" }), // push
    ];
    const shell = createScriptedShell([
      ok(), // add
      ok({ stdout: " M f\n" }), // status
      ok(), // commit
      ...failingCycle,
      ...failingCycle,
    ]);
    const ctx = buildCtx({
      config: { paths: ["f"], message: "m", branch: "feat", maxRetries: 2 },
      shell: shell.gateway,
      store: createStubStore(),
      cwd: "/wt",
    });
    await expect(runner.run(ctx)).rejects.toThrow(/exhausted 2 retries/);
  });
});

// =========================================================================
// git.worktree.remove
// =========================================================================

describe("git.worktree.remove", () => {
  const runner = createGitWorktreeRemoveRunner();

  it("removes the worktree and deletes the branch by default", async () => {
    const shell = createScriptedShell([
      ok(), // worktree remove --force
      ok(), // branch -D
    ]);
    const store = createStubStore();
    const ctx = buildCtx({
      config: {
        repoDir: "/repo",
        worktreePath: "/repo/.worktrees/feat",
        branch: "feat",
      },
      shell: shell.gateway,
      store,
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced");
    expect(shell.argvs()).toEqual([
      ["git", "worktree", "remove", "--force", "/repo/.worktrees/feat"],
      ["git", "branch", "-D", "feat"],
    ]);
    expect(store.last()?.metadata.branchDeleted).toBe("true");
  });

  it("does not fail when `branch -D` reports the branch is missing (idempotence)", async () => {
    const shell = createScriptedShell([
      ok(), // worktree remove
      ok({ exitCode: 1, stderr: "branch 'feat' not found" }),
    ]);
    const store = createStubStore();
    const ctx = buildCtx({
      config: {
        repoDir: "/repo",
        worktreePath: "/repo/.worktrees/feat",
        branch: "feat",
      },
      shell: shell.gateway,
      store,
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced");
    expect(store.last()?.metadata.branchDeleted).toBe("false");
  });

  it("skips branch deletion when deleteBranch=false", async () => {
    const shell = createScriptedShell([ok()]);
    const ctx = buildCtx({
      config: {
        repoDir: "/repo",
        worktreePath: "/repo/.worktrees/feat",
        deleteBranch: false,
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await runner.run(ctx);
    expect(shell.argvs()).toEqual([
      ["git", "worktree", "remove", "--force", "/repo/.worktrees/feat"],
    ]);
  });

  it("rejects a worktreePath outside repoDir (G2-git)", async () => {
    const shell = createScriptedShell([]);
    const ctx = buildCtx({
      config: {
        repoDir: "/repo",
        worktreePath: "/other/place",
        branch: "feat",
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/escapes/);
    expect(shell.calls).toHaveLength(0);
  });
});

// =========================================================================
// Shared invariants across all git runners
// =========================================================================

describe("git runners — shared invariants", () => {
  const createRunner = createGitWorktreeCreateRunner();
  const removeRunner = createGitWorktreeRemoveRunner();
  const commitPushRunner = createGitCommitPushRunner();

  it("every call goes through useShell:false (G3-git)", async () => {
    const shell = createScriptedShell([
      ok(), // add
      ok({ stdout: " M f\n" }), // status
      ok(), // commit
      ok(), // fetch
      ok(), // rebase
      ok(), // push
      ok({ stdout: "sha\n" }), // rev-parse
    ]);
    const ctx = buildCtx({
      config: { paths: ["f"], message: "m", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
      cwd: "/wt",
    });
    await commitPushRunner.run(ctx);
    for (const call of shell.calls) {
      expect(call.useShell).toBe(false);
      expect(argvOf(call)[0]).toBe("git");
      expect(call.timeoutMs).toBeGreaterThan(0);
    }
  });

  it("every call carries a bounded timeoutMs (G6-git)", async () => {
    const shell = createScriptedShell([ok()]);
    const ctx = buildCtx({
      config: {
        repoDir: "/repo",
        worktreePath: "/repo/.worktrees/feat",
        deleteBranch: false,
      },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await removeRunner.run(ctx);
    expect(shell.calls[0].timeoutMs).toBeGreaterThan(0);
    expect(shell.calls[0].timeoutMs).toBeLessThanOrEqual(600_000);
  });

  it("does not forward unrelated host env vars (G3-git)", async () => {
    const shell = createScriptedShell([ok()]);
    const ctx = buildCtx({
      config: { repoDir: "/repo", branch: "feat" },
      shell: shell.gateway,
      store: createStubStore(),
    });
    await createRunner.run(ctx);
    // The stub environment returns `STUB_<key>` for each whitelisted key.
    // It must NOT return anything that wasn't asked for, so we just check
    // there's no `ANTHROPIC_API_KEY`-shaped passthrough.
    expect(Object.keys(shell.calls[0].env)).not.toContain("ANTHROPIC_API_KEY");
    expect(Object.keys(shell.calls[0].env)).toContain("PATH");
    expect(Object.keys(shell.calls[0].env)).toContain("SSH_AUTH_SOCK");
  });
});
