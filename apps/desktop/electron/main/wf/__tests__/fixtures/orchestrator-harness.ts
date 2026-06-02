/**
 * Wires the real {@link InstanceOrchestrator} + {@link EngineState} on top of
 * a complete set of fakes for every outbound port. Returns a high-level API
 * to script a workflow run from a test, with promise-based waits on the
 * projected state (no polling, no arbitrary sleeps).
 */
import { createEngineState, type EngineState } from "../../application/engine-state";
import {
  createInstanceOrchestrator,
  type InstanceOrchestrator,
} from "../../application/orchestrator/instance-orchestrator";
import {
  createStepRunnerRegistry,
  type StepRunner,
  type StepRunnerRegistry,
} from "../../application/step-runner";
import type { ValidationMode } from "../../application/artifact-io";
import type { DomainEvent } from "../../domain/events";
import type { WorkflowId } from "../../domain/ids";
import type { InstanceStatus } from "../../domain/instance";
import type { WorkflowTemplate } from "../../domain/template";

import { createBranchBoolRunner } from "../../plugins/branch-bool";
import { createBranchJsonRunner } from "../../plugins/branch-json";
import { createConcatMarkdownRunner } from "../../plugins/concat-markdown";
import { createHumanGateRunner } from "../../plugins/human-gate";
import { createLlmJudgeRunner } from "../../plugins/llm-judge";
import { createLoopCollectRunner } from "../../plugins/loop-collect";
import { createLoopForeachRunner } from "../../plugins/loop-foreach";
import { createSkillLoaderRunner } from "../../plugins/skill-loader";
import { createUserInputRunner } from "../../plugins/user-input";
import { createWorkspaceSetRunner } from "../../plugins/workspace-set";

import { makeOpenFeedbackLoop } from "../../application/use-cases/open-feedback-loop";
import { makeStartInstance } from "../../application/use-cases/start-instance";
import { makeSubmitHumanDecision } from "../../application/use-cases/submit-human-decision";

import { createFakeArtifactStore, type FakeArtifactStore } from "./fake-artifact-store";
import {
  createFakeChannelContext,
  type FakeChannelContext,
} from "./fake-channel-context";
import { createFakeClock, type FakeClock } from "./fake-clock";
import { createFakeEnvironment, type FakeEnvironment } from "./fake-env";
import {
  createFakeEventBus,
  createFakeLlmSessionBus,
  type FakeEventBus,
  type FakeLlmSessionBus,
} from "./fake-event-bus";
import { createFakeEventLog, type FakeEventLog } from "./fake-event-log";
import { createFakeFileSystem, type FakeFileSystem } from "./fake-fs";
import { createFakeHash } from "./fake-hash";
import { createFakeIdGenerator, type FakeIdGenerator } from "./fake-ids";
import { createFakeLLMGateway, type FakeLLMGateway } from "./fake-llm";
import { createFakeLinearGateway, type FakeLinearGateway } from "./fake-linear";
import { createFakeLogger, type FakeLogger } from "./fake-logger";
import { createFakeNotifier, type FakeNotifier } from "./fake-notifier";
import { createFakeParserRuntime, type FakeParserRuntime } from "./fake-parser-runtime";
import { createFakePath } from "./fake-path";
import {
  createFakeArtifactSchemaRegistry,
  createFakeParserRegistry,
  createFakeSkillRegistry,
  createFakeTemplateRegistry,
  type FakeArtifactSchemaRegistry,
  type FakeParserRegistry,
  type FakeSkillRegistry,
  type FakeTemplateRegistry,
} from "./fake-registries";
import { createFakeRunLog, type FakeRunLog } from "./fake-run-log";
import { createFakeShellGateway, type FakeShellGateway } from "./fake-shell";

export type HarnessOverrides = {
  /** Validation mode; default `"strict"` mirrors the prod default. */
  validationMode?: ValidationMode;
  /** Pre-register additional runners (e.g. custom test runner). */
  extraRunners?: ReadonlyArray<StepRunner>;
  /** Skip registering the default builtin runners (you'll get an empty registry). */
  skipBuiltinRunners?: boolean;
  /** Pre-seed templates into the registry. */
  templates?: ReadonlyArray<WorkflowTemplate>;
};

export type HarnessFakes = {
  bus: FakeEventBus;
  log: FakeEventLog;
  clock: FakeClock;
  ids: FakeIdGenerator;
  artifactStore: FakeArtifactStore;
  llm: FakeLLMGateway;
  linear: FakeLinearGateway;
  shell: FakeShellGateway;
  runLog: FakeRunLog;
  notifier: FakeNotifier;
  llmSession: FakeLlmSessionBus;
  logger: FakeLogger;
  environment: FakeEnvironment;
  fs: FakeFileSystem;
  templates: FakeTemplateRegistry;
  skills: FakeSkillRegistry;
  artifactSchemas: FakeArtifactSchemaRegistry;
  parsers: FakeParserRegistry;
  parserRuntime: FakeParserRuntime;
  channels: FakeChannelContext;
};

export type OrchestratorHarness = {
  fakes: HarnessFakes;
  state: EngineState;
  runners: StepRunnerRegistry;
  orchestrator: InstanceOrchestrator;

  /** Bound use-cases. */
  startInstance: ReturnType<typeof makeStartInstance>;
  submitHumanDecision: ReturnType<typeof makeSubmitHumanDecision>;
  openFeedbackLoop: ReturnType<typeof makeOpenFeedbackLoop>;

  /**
   * Promise-based wait for `state.getInstance(id)?.status === status`. Resolves
   * on the next bus tick after the condition becomes true. Rejects on timeout
   * with a descriptive message (instance status at timeout, last few events).
   */
  waitForStatus(id: WorkflowId, status: InstanceStatus, timeoutMs?: number): Promise<void>;
  /**
   * Promise-based wait for an event matching the type + predicate. Resolves
   * with the matched event. Useful when a test wants to react to a specific
   * inner transition (e.g. `StepProducedArtifact` on a particular exec).
   */
  waitForEvent<T extends DomainEvent["type"]>(
    type: T,
    predicate?: (e: Extract<DomainEvent, { type: T }>) => boolean,
    timeoutMs?: number,
  ): Promise<Extract<DomainEvent, { type: T }>>;

  /** Tear down (unsubscribes the orchestrator, clears the dynamic resolver). */
  stop(): void;
};

const DEFAULT_TIMEOUT_MS = 2000;

const registerBuiltinRunners = (registry: StepRunnerRegistry): void => {
  registry.register(createUserInputRunner());
  registry.register(createHumanGateRunner());
  registry.register(createBranchBoolRunner());
  registry.register(createBranchJsonRunner());
  registry.register(createConcatMarkdownRunner());
  registry.register(createLlmJudgeRunner());
  registry.register(createLoopForeachRunner());
  registry.register(createLoopCollectRunner());
  registry.register(createSkillLoaderRunner());
  registry.register(createWorkspaceSetRunner());
};

export const createOrchestratorHarness = (
  overrides: HarnessOverrides = {},
): OrchestratorHarness => {
  const fakes: HarnessFakes = {
    bus: createFakeEventBus(),
    log: createFakeEventLog(),
    clock: createFakeClock(),
    ids: createFakeIdGenerator(),
    artifactStore: createFakeArtifactStore(),
    llm: createFakeLLMGateway(),
    linear: createFakeLinearGateway(),
    shell: createFakeShellGateway(),
    runLog: createFakeRunLog(),
    notifier: createFakeNotifier(),
    llmSession: createFakeLlmSessionBus(),
    logger: createFakeLogger(),
    environment: createFakeEnvironment(),
    fs: createFakeFileSystem(),
    templates: createFakeTemplateRegistry(overrides.templates ?? []),
    skills: createFakeSkillRegistry(),
    artifactSchemas: createFakeArtifactSchemaRegistry(),
    parsers: createFakeParserRegistry(),
    parserRuntime: createFakeParserRuntime(),
    channels: createFakeChannelContext(),
  };

  // Engine state subscribes to the bus before the orchestrator does so it
  // sees every event in order (mirrors `composition-root.ts`).
  const state = createEngineState();
  fakes.bus.subscribe((evt) => state.apply(evt));

  const runners = createStepRunnerRegistry();
  if (!overrides.skipBuiltinRunners) registerBuiltinRunners(runners);
  for (const r of overrides.extraRunners ?? []) runners.register(r);

  const orchestrator = createInstanceOrchestrator({
    bus: fakes.bus,
    log: fakes.log,
    clock: fakes.clock,
    ids: fakes.ids,
    state,
    templates: fakes.templates,
    runners,
    artifactStore: fakes.artifactStore,
    artifactSchemas: fakes.artifactSchemas,
    llm: fakes.llm,
    linear: fakes.linear,
    shell: fakes.shell,
    runLog: fakes.runLog,
    notifier: fakes.notifier,
    llmSession: fakes.llmSession,
    logger: fakes.logger,
    hash: createFakeHash(),
    path: createFakePath(),
    environment: fakes.environment,
    fs: fakes.fs,
    validationMode: overrides.validationMode ?? "strict",
    parsers: fakes.parsers,
    parserRuntime: fakes.parserRuntime,
    skills: fakes.skills,
  });
  orchestrator.start();

  const startInstance = makeStartInstance({
    templates: fakes.templates,
    artifactStore: fakes.artifactStore,
    bus: fakes.bus,
    log: fakes.log,
    clock: fakes.clock,
    ids: fakes.ids,
    channels: fakes.channels,
  });
  const submitHumanDecision = makeSubmitHumanDecision({
    bus: fakes.bus,
    log: fakes.log,
    clock: fakes.clock,
    ids: fakes.ids,
  });
  const openFeedbackLoop = makeOpenFeedbackLoop({
    bus: fakes.bus,
    log: fakes.log,
    clock: fakes.clock,
    ids: fakes.ids,
    templates: fakes.templates,
    state,
  });

  const waitForStatus = (
    id: WorkflowId,
    status: InstanceStatus,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const current = state.getInstance(id);
      if (current?.status === status) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        unsub();
        const inst = state.getInstance(id);
        const tail = fakes.bus.published.slice(-5).map((e) => e.type).join(", ");
        reject(
          new Error(
            `[harness] timed out waiting for instance ${id} status=${status}; actual=${inst?.status ?? "<none>"}; last events=[${tail}]`,
          ),
        );
      }, timeoutMs);
      const unsub = fakes.bus.subscribe(() => {
        const inst = state.getInstance(id);
        if (inst?.status === status) {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      });
    });

  const waitForEvent = <T extends DomainEvent["type"]>(
    type: T,
    predicate?: (e: Extract<DomainEvent, { type: T }>) => boolean,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Extract<DomainEvent, { type: T }>> =>
    new Promise((resolve, reject) => {
      // Already-published match?
      const existing = fakes.bus.published.find(
        (e): e is Extract<DomainEvent, { type: T }> =>
          e.type === type && (!predicate || predicate(e as never)),
      );
      if (existing) {
        resolve(existing);
        return;
      }
      const timer = setTimeout(() => {
        unsub();
        const tail = fakes.bus.published.slice(-5).map((e) => e.type).join(", ");
        reject(new Error(`[harness] timed out waiting for event ${type}; last events=[${tail}]`));
      }, timeoutMs);
      const unsub = fakes.bus.subscribe((e) => {
        if (e.type !== type) return;
        if (predicate && !predicate(e as never)) return;
        clearTimeout(timer);
        unsub();
        resolve(e as Extract<DomainEvent, { type: T }>);
      });
    });

  return {
    fakes,
    state,
    runners,
    orchestrator,
    startInstance,
    submitHumanDecision,
    openFeedbackLoop,
    waitForStatus,
    waitForEvent,
    stop() {
      orchestrator.stop();
    },
  };
};
