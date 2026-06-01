/**
 * Use-case `debugStep` — exécute une node isolée avec des inputs saisis à la
 * main, sans persistance. Adossé à un sandbox jetable (artifactStore en
 * mémoire, runLog no-op, llmSession bus jetable). Les autres ports
 * (LLM/Shell/Linear/Filesystem) restent ceux du moteur réel — un test sur
 * `shell.exec` exécute une vraie commande, idem pour `claude_code.invoke`.
 *
 * Cf. specs/node-studio-debug.md §Architecture pour la rationale.
 */
import type { Artifact, ArtifactKind } from "../../domain/artifact";
import { serializeFromString } from "../../domain/artifact-serializer";
import {
  asArtifactHash,
  asArtifactId,
  asStepExecId,
  asStepId,
  asWorkflowId,
  type ArtifactId,
} from "../../domain/ids";
import type { StepDef, StepKindId } from "../../domain/template";
import { putArtifactPayload } from "../artifact-io";
import type {
  ArtifactContent,
  ArtifactStore,
} from "../ports/outbound/artifact-store";
import type { ClockPort } from "../ports/outbound/clock";
import type { EnvironmentPort } from "../ports/outbound/environment";
import type {
  LlmSessionBus,
  LlmSessionEvent,
  LlmSessionHandler,
} from "../ports/outbound/event-bus";
import type { FileSystemPort } from "../ports/outbound/file-system";
import type { HashPort } from "../ports/outbound/hash";
import type { IdGenerator } from "../ports/outbound/id-generator";
import type { LinearGateway } from "../ports/outbound/linear-gateway";
import type { LLMGateway } from "../ports/outbound/llm-gateway";
import type { LoggerPort } from "../ports/outbound/logger";
import type { ParserRegistry } from "../ports/outbound/parser-registry";
import type { ParserRuntime } from "../ports/outbound/parser-runtime";
import type { PathPort } from "../ports/outbound/path";
import type { RunLog } from "../ports/outbound/run-log";
import type { ShellGateway } from "../ports/outbound/shell-gateway";
import type { SkillRegistry } from "../ports/outbound/skill-registry";
import type { ArtifactSchemaRegistry } from "../ports/outbound/artifact-schema-registry";
import type {
  RunContext,
  RunContextInput,
  StepOutcome,
  StepRunnerRegistry,
} from "../step-runner";

export type DebugStepInputEntry = {
  port: string;
  kind: ArtifactKind;
  content: string;
};

export type DebugStepInput = {
  step: {
    id: string;
    name: string;
    kind: StepKindId;
    actorRole: "PO" | "Developer" | "LLMAgent";
    config: Readonly<Record<string, unknown>>;
    humanGateRequired: boolean;
    writesTo?: Readonly<Record<string, string>>;
    readsFrom?: Readonly<Record<string, string>>;
    note?: string;
  };
  inputs: ReadonlyArray<DebugStepInputEntry>;
};

export type DebugStepProducedArtifact = {
  port: string;
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

export type DebugStepResult =
  | { kind: "produced"; artifacts: ReadonlyArray<DebugStepProducedArtifact> }
  | { kind: "awaiting-human"; actorRole: string }
  | { kind: "workspace-set"; cwd: string }
  | { kind: "error"; message: string };

type Deps = {
  runners: StepRunnerRegistry;
  parsers?: ParserRegistry;
  parserRuntime?: ParserRuntime;
  skills?: SkillRegistry;
  artifactSchemas?: ArtifactSchemaRegistry;
  llm: LLMGateway;
  linear: LinearGateway;
  shell: ShellGateway;
  clock: ClockPort;
  ids: IdGenerator;
  logger: LoggerPort;
  hash: HashPort;
  path: PathPort;
  environment: EnvironmentPort;
  fs: FileSystemPort;
};

type Sandbox = {
  artifactStore: ArtifactStore;
  runLog: RunLog;
  llmSession: LlmSessionBus;
  dispose: () => void;
};

const createInMemoryArtifactStore = (deps: {
  ids: IdGenerator;
  clock: ClockPort;
  hash: HashPort;
}): ArtifactStore => {
  // No hash-dedup: in the studio, input and output may share byte-identical
  // JSON envelopes (e.g. user.input passing Markdown straight through keeps
  // the same `{format,body}` shape), and dedup would mis-attribute the kind.
  // The sandbox is short-lived anyway — dedup has no storage benefit here.
  const byId = new Map<ArtifactId, ArtifactContent>();

  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      const hash = deps.hash.sha256([content]);
      const id = asArtifactId(deps.ids.newId());
      const artifact: Artifact = {
        id,
        kind,
        hash: asArtifactHash(hash),
        storageRef: `debug-sandbox://${id}`,
        metadata,
        createdAt: deps.clock.now(),
      };
      byId.set(id, { meta: artifact, content });
      return artifact;
    },

    async get(id): Promise<ArtifactContent> {
      const entry = byId.get(id);
      if (!entry) throw new Error(`debug sandbox: artifact not found: ${id}`);
      return entry;
    },

    async getByHash(): Promise<ArtifactContent | null> {
      // Not used in the studio flow: runners look up their inputs by
      // ArtifactId, not by hash.
      return null;
    },
  };
};

const createNoopRunLog = (): RunLog => ({
  async record(): Promise<void> {
    /* no-op: studio runs are not logged */
  },
  async listByStepExec() {
    return [];
  },
});

const createEphemeralLlmSessionBus = (): LlmSessionBus => {
  const handlers = new Set<LlmSessionHandler>();
  const buffered: LlmSessionEvent[] = [];
  return {
    emit(evt: LlmSessionEvent): void {
      buffered.push(evt);
      for (const h of handlers) h(evt);
    },
    subscribe(handler: LlmSessionHandler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    getReplay(stepExecId: string): ReadonlyArray<LlmSessionEvent> {
      return buffered.filter((e) => e.stepExecId === stepExecId);
    },
  };
};

const createDebugSandbox = (deps: Deps): Sandbox => {
  const artifactStore = createInMemoryArtifactStore({
    ids: deps.ids,
    clock: deps.clock,
    hash: deps.hash,
  });
  const runLog = createNoopRunLog();
  const llmSession = createEphemeralLlmSessionBus();
  return {
    artifactStore,
    runLog,
    llmSession,
    dispose: () => {
      // The maps will be garbage-collected when this closure goes out of
      // scope. Explicit dispose left for symmetry / future buffer clearing.
    },
  };
};

const buildDebugInputs = async (
  store: ArtifactStore,
  entries: ReadonlyArray<DebugStepInputEntry>,
): Promise<RunContextInput[]> => {
  const out: RunContextInput[] = [];
  for (const entry of entries) {
    const payload = serializeFromString(entry.kind, entry.content);
    const artifact = await putArtifactPayload(
      store,
      entry.kind,
      payload,
      { source: "debug-studio" },
    );
    out.push({
      port: entry.port,
      kind: entry.kind,
      content: entry.content,
      payload,
      artifactId: artifact.id,
    });
  }
  return out;
};

const toStepDef = (step: DebugStepInput["step"]): StepDef => ({
  id: asStepId(step.id),
  name: step.name,
  kind: step.kind,
  actorRole: step.actorRole,
  config: step.config,
  humanGateRequired: step.humanGateRequired,
  writesTo: step.writesTo,
  readsFrom: step.readsFrom,
  note: step.note,
});

const toDebugResult = async (
  outcome: StepOutcome,
  store: ArtifactStore,
): Promise<DebugStepResult> => {
  switch (outcome.kind) {
    case "produced":
    case "produced-pending-human": {
      const { content, meta } = await store.get(outcome.artifact.id);
      return {
        kind: "produced",
        artifacts: [
          {
            port: "out",
            kind: meta.kind,
            content,
            metadata: { ...meta.metadata },
          },
        ],
      };
    }
    case "produced-many": {
      const out: DebugStepProducedArtifact[] = [];
      for (const slot of outcome.artifacts) {
        const { content, meta } = await store.get(slot.artifact.id);
        out.push({
          port: slot.port,
          kind: meta.kind,
          content,
          metadata: { ...meta.metadata },
        });
      }
      return { kind: "produced", artifacts: out };
    }
    case "produced-on-port": {
      const { content, meta } = await store.get(outcome.artifact.id);
      return {
        kind: "produced",
        artifacts: [
          {
            port: outcome.port,
            kind: meta.kind,
            content,
            metadata: { ...meta.metadata },
          },
        ],
      };
    }
    case "awaiting-human":
      return { kind: "awaiting-human", actorRole: outcome.actorRole };
    case "workspace-set":
      return { kind: "workspace-set", cwd: outcome.cwd };
  }
};

export type DebugStep = (input: DebugStepInput) => Promise<DebugStepResult>;

export const makeDebugStep =
  (deps: Deps): DebugStep =>
  async (input: DebugStepInput): Promise<DebugStepResult> => {
    let runner;
    try {
      runner = deps.runners.resolve(input.step.kind);
    } catch {
      return {
        kind: "error",
        message: `Unknown step kind: ${input.step.kind}`,
      };
    }

    const sandbox = createDebugSandbox(deps);
    try {
      const inputs = await buildDebugInputs(sandbox.artifactStore, input.inputs);
      const ctx: RunContext = {
        instanceId: asWorkflowId(`debug-${deps.ids.newId()}`),
        stepExecId: asStepExecId(`debug-${deps.ids.newId()}`),
        stepId: asStepId(input.step.id),
        step: toStepDef(input.step),
        inputs,
        loopHistory: [],
        attempt: 0,
        workspace: {},
        deps: {
          artifactStore: sandbox.artifactStore,
          llm: deps.llm,
          linear: deps.linear,
          shell: deps.shell,
          runLog: sandbox.runLog,
          clock: deps.clock,
          ids: deps.ids,
          llmSession: sandbox.llmSession,
          logger: deps.logger,
          hash: deps.hash,
          path: deps.path,
          environment: deps.environment,
          fs: deps.fs,
          parsers: deps.parsers,
          parserRuntime: deps.parserRuntime,
          skills: deps.skills,
          artifactSchemas: deps.artifactSchemas,
        },
      };
      const outcome = await runner.run(ctx);
      return await toDebugResult(outcome, sandbox.artifactStore);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      return { kind: "error", message };
    } finally {
      sandbox.dispose();
    }
  };
