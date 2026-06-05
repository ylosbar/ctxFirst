/**
 * Domain events form the **source of truth** for workflow state. All mutations
 * go through an event that is appended to the event log (SQLite) and published
 * on the in-memory bus; the {@link WorkflowInstance} state is *projected* from
 * the event stream (see `projection.ts`).
 *
 * Events are immutable after append. Adding a new event type requires a new
 * variant in the {@link DomainEvent} union and a case in the projection reducer.
 */
import type { ReviewComment } from "./feedback";
import type { ArtifactId, EventId, LoopId, StepExecId, StepId, TemplateId, TemplateVersion, WorkflowId } from "./ids";
import type { StepKindId, WorkflowTemplate } from "./template";

/** Fields shared by every domain event. */
export type DomainEventCommon = {
  /** Stable UUID; used to deduplicate replays and idempotent forwarding. */
  eventId: EventId;
  /** ISO-8601 timestamp at which the event was emitted. */
  at: string;
};

/**
 * Discriminated union of every workflow event.
 *
 * Adding a variant:
 *  1. Add the new shape here.
 *  2. Handle it in `domain/projection.ts`.
 *  3. If the orchestrator should react, add a case in
 *     `application/orchestrator/instance-orchestrator.ts`.
 */
export type DomainEvent = DomainEventCommon &
  (
    | {
        type: "InstanceStarted";
        instanceId: WorkflowId;
        templateId: TemplateId;
        templateVersion: TemplateVersion;
        seed: ReadonlyArray<ArtifactId>;
        /**
         * Variables pre-assigned from `TemplateVariable.defaultValue`, resolved
         * to artifacts at launch. Absent on pre-migration events — the
         * projection treats `undefined` as "no defaults". A later
         * `VariableAssigned` overwrites a default (last-writer-wins).
         */
        variableDefaults?: ReadonlyArray<{ name: string; artifactId: ArtifactId }>;
        /** Initial working directory for native side-effects (e.g. claude CLI cwd). */
        cwd?: string;
        /**
         * Channel that owns this instance, pinned at start. Absent on
         * pre-migration events — the projection treats `undefined` as the
         * default channel for backward compatibility.
         */
        channelId?: string;
        /**
         * Flattened template the instance runs against, when the root template
         * contained `workflow.call` steps (`sub-template-expand.md` §6).
         * Embedding it in the event keeps replay deterministic: rejouer le
         * journal reconstruit exactement le même graphe sans re-questionner un
         * registry qui a pu bouger. Absent for instances without sub-workflows.
         */
        effectiveTemplate?: WorkflowTemplate;
        /**
         * Invocation depth in the `template.invoke` tree (root = 0, child =
         * parent + 1; `sub-template-invoke.md` §14). Absent on pre-spec events —
         * the projection treats `undefined` as `0`.
         */
        depth?: number;
        /**
         * Set when this instance was spawned by a parent's `template.invoke`
         * (Approach A, `sub-template-invoke.md` §4). Pins the filiation on the
         * child side too. Absent for root instances and for every pre-spec
         * event. Never present in Phase A (no runner spawns children yet).
         */
        parent?: { instanceId: WorkflowId; stepExecId: StepExecId };
        /**
         * JSON-safe array form of the transitive sub-template snapshot frozen at
         * root-instance start (`sub-template-invoke.md` §7). The projection folds
         * it into `WorkflowInstance.templateSnapshots` (a `Map`); the array form
         * is used here because the event log persists raw JSON and `Map`s do not
         * serialize. Absent when the root has no `template.invoke` — i.e. always
         * in Phase A.
         */
        templateSnapshots?: ReadonlyArray<{ ref: string; template: WorkflowTemplate }>;
      }
    | {
        type: "WorkspaceChanged";
        instanceId: WorkflowId;
        /** Step that triggered the change (a `workspace.set` exec). */
        stepExecId: StepExecId;
        cwd: string;
      }
    | {
        type: "StepStarted";
        instanceId: WorkflowId;
        stepExecId: StepExecId;
        stepId: StepId;
        kind: StepKindId;
        inputArtifacts: ReadonlyArray<ArtifactId>;
        /** Set when this StepExec was spawned by a feedback loop. */
        loopFrom?: StepExecId;
        /**
         * Set when this execution belongs to a loop iteration scope. Opaque
         * key (`${loopStepId}:${index}` in v1). Two execs sharing this key
         * belong to the same iteration of the same loop scope. Absent on
         * pre-loop events — the projection treats `undefined` as "outside
         * any scope".
         */
        iterationKey?: string;
        /**
         * One-off config patch applied to this execution only (rewind & replay
         * / retry-from-failed). Shallow-merged over `step.config` at run time;
         * persisted here so a replay re-applies the same patch without re-reading
         * the triggering `StepRerunRequested`. Projected into
         * `StepExecution.appliedConfigOverride`. Absent = ran with the template
         * config verbatim. See `specs/run-rerun-from-node.md`.
         */
        configOverride?: Readonly<Record<string, unknown>>;
      }
    | {
        /**
         * Emitted once per item by the orchestrator right after a
         * `loop.foreach` validates. Materializes the N "iteration slots"
         * downstream steps will key on (`StepStarted.iterationKey`), and
         * pins the per-item artifact that downstream `loadFromTransition`
         * resolutions must pick when the upstream is the foreach.
         */
        type: "IterationStarted";
        instanceId: WorkflowId;
        /** Step id of the `loop.foreach` that opened the scope. */
        loopStepId: StepId;
        /** The exec that produced the list artifact (the foreach's exec). */
        loopStepExecId: StepExecId;
        /** Opaque iteration key — see `StepExecution.iterationKey`. */
        iterationKey: string;
        /** 0-based index of this iteration in the array. */
        index: number;
        /**
         * Per-item artifact materialized by the orchestrator from the
         * foreach's list artifact. Downstream steps inside the scope read
         * this id when resolving the foreach as their upstream.
         */
        itemArtifactId: ArtifactId;
      }
    | {
        type: "StepProducedArtifact";
        instanceId: WorkflowId;
        stepExecId: StepExecId;
        artifactId: ArtifactId;
        /**
         * Name of the output slot this artifact belongs to (matches
         * `NodeSpec.outputs[*].name`). Absent on pre-migration events; the
         * projection routes those to `"out"` for backward compatibility.
         */
        port?: string;
      }
    | {
        /**
         * Emitted by the orchestrator after a `StepProducedArtifact` whose
         * `port` is mapped to a template variable via `step.writesTo`.
         * Materializes the routing into the instance-level variable store;
         * the projection updates `state.variables[name] = artifactId`
         * (last-writer-wins).
         */
        type: "VariableAssigned";
        instanceId: WorkflowId;
        stepExecId: StepExecId;
        variableName: string;
        artifactId: ArtifactId;
      }
    | {
        type: "StepAwaitingHumanGate";
        instanceId: WorkflowId;
        stepExecId: StepExecId;
        /** Role expected to resolve the gate (used by RBAC in v2). */
        actorRole: string;
      }
    | {
        type: "StepValidated";
        instanceId: WorkflowId;
        stepExecId: StepExecId;
        /** "auto" for non-human-gated steps, otherwise a user identifier. */
        by: string;
      }
    | {
        type: "StepFailed";
        instanceId: WorkflowId;
        stepExecId: StepExecId;
        error: string;
      }
    | {
        /**
         * Emitted by the orchestrator for every step that an upstream
         * `branch.*` decision has excluded. Carries the closest upstream
         * branch step + the port it chose so the UI can render
         * "skipped because branch X chose Y" without re-traversing the graph.
         *
         * `kind` is denormalized on the event (mirror of `StepStarted.kind`)
         * so a late replay can rebuild the projection without needing the
         * template at hand.
         */
        type: "StepSkipped";
        instanceId: WorkflowId;
        stepExecId: StepExecId;
        stepId: StepId;
        kind: StepKindId;
        cause: {
          branchStepId: StepId;
          branchStepExecId: StepExecId;
          /** Port the branch DID produce — the one this step is NOT on. */
          chosenPort: string;
        };
        /** Optional iteration key — set to align with the producing branch. */
        iterationKey?: string;
      }
    | {
        type: "LoopOpened";
        instanceId: WorkflowId;
        loopId: LoopId;
        fromStepExec: StepExecId;
        toStepId: StepId;
        /** Review summary (legacy `reason`). May be empty when only inline comments are supplied. */
        reason: string;
        /** Optional line-anchored review comments. Absent on legacy events. */
        comments?: ReadonlyArray<ReviewComment>;
        author: string;
      }
    | {
        type: "LoopClosed";
        instanceId: WorkflowId;
        loopId: LoopId;
      }
    | {
        /**
         * Intentional trigger for a "rewind & replay": the user asked to re-run
         * the run from a given node. Purely intentional (like `LoopOpened`) — it
         * does not mutate the projection by itself (falls through `applyEvent`'s
         * `default`); the orchestrator reacts by superseding the target's
         * transitive downstream and re-starting the target. See
         * `specs/run-rerun-from-node.md`.
         */
        type: "StepRerunRequested";
        instanceId: WorkflowId;
        /** The exec (`validated` or `failed`) to replay from. */
        stepExecId: StepExecId;
        /** Author of the replay ("user" by default), for audit. */
        author: string;
        /**
         * Config patch applied TO THE TARGET NODE for this replay only. Shallow
         * merge over `step.config`. Absent = replay with identical config.
         * Forwarded onto the target's `StepStarted.configOverride`.
         */
        configOverride?: Readonly<Record<string, unknown>>;
      }
    | {
        /**
         * Emitted by the orchestrator for each live exec of the replayed
         * subgraph (target + transitive downstream) right before the target is
         * re-started. Marks the exec `superseded` so a convergent step waits for
         * the fresh exec instead of consuming the stale output. Append-only — the
         * superseded exec stays in the timeline for audit. See
         * `specs/run-rerun-from-node.md`.
         */
        type: "StepSuperseded";
        instanceId: WorkflowId;
        /** The exec to mark `superseded`. */
        stepExecId: StepExecId;
      }
    | {
        type: "InstanceCompleted";
        instanceId: WorkflowId;
        /** Artifact produced by the last validated step. */
        finalArtifact?: ArtifactId;
      }
    | {
        /**
         * Emitted when a `template.invoke` step starts a child instance
         * (`sub-template-invoke.md` §4, Approach A). The orchestrator appends it
         * right after `StepStarted` and before flipping the step to
         * `awaitingChild`; the child receives its own `InstanceStarted` with
         * `parent` populated. Carries `stepExecId` (not just `stepId`) so that a
         * `template.invoke` inside a `loop.foreach` wakes the *exact* iteration
         * exec (§15a).
         *
         * **Phase A:** defined and projected, but never emitted — no runner
         * exists to spawn a child yet.
         */
        type: "ChildInstanceSpawned";
        instanceId: WorkflowId; // parent
        stepExecId: StepExecId; // parent step exec
        childInstanceId: WorkflowId;
        childTemplateId: TemplateId;
        childTemplateVersion: TemplateVersion;
        /** Seed artifacts forwarded to the child (one per child `input` variable). */
        seedBindings: ReadonlyArray<{ variableName: string; artifactId: ArtifactId }>;
      }
    | {
        /**
         * Emitted when a child instance reaches a terminal state, to drive the
         * parent step out of `awaitingChild` (`sub-template-invoke.md` §4/§5b).
         * Outputs are captured at emission time (mapping child `output` variable
         * name → ArtifactId) so the parent reducer never needs to peek into the
         * child's projected state at replay time. Empty on `outcome: "failed"`.
         *
         * **Phase A:** defined and projected, but never emitted.
         */
        type: "ChildInstanceCompleted";
        instanceId: WorkflowId; // parent
        stepExecId: StepExecId; // parent step exec
        childInstanceId: WorkflowId;
        outputs: ReadonlyArray<{ variableName: string; artifactId: ArtifactId }>;
        outcome: "completed" | "failed";
        /** Set on failure to surface the child's error on the parent step. */
        error?: string;
      }
  );

/** Narrow type containing only the valid event-type discriminators. */
export type DomainEventType = DomainEvent["type"];
