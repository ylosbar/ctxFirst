/**
 * Read-only use-case: aggregates every {@link StepExecution} in status
 * `awaitingHuman` across every known {@link WorkflowInstance}. Powers the
 * home "Inbox" view (Feature 1) — see `specs/home-features.md`.
 *
 * Pure query: reads the in-memory {@link EngineState} and resolves step
 * metadata against the {@link TemplateRegistry}. Returns rows sorted from
 * the oldest blockage to the most recent (oldest first) so the UI can show
 * what has been waiting longest at the top.
 */
import type { ChannelContext } from "../ports/outbound/channel-context";
import type { EngineState } from "../engine-state";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { ActorRole } from "../../domain/template";
import { findStep } from "../../domain/template";
import type {
  ArtifactId,
  StepExecId,
  StepId,
  TemplateId,
  TemplateVersion,
  WorkflowId,
} from "../../domain/ids";

export type AwaitingHumanRow = {
  instanceId: WorkflowId;
  /** Human-readable label; until instances expose a real label, this is a short ID. */
  instanceLabel: string;
  templateId: TemplateId;
  templateVersion: TemplateVersion;
  stepExecId: StepExecId;
  stepId: StepId;
  stepName: string;
  actorRole: ActorRole;
  /**
   * Artifact under review. A `human.gate` step never produces an output of its
   * own; it is gating the previous step's output, exposed here via the gate
   * execution's `inputArtifacts[0]` (matches the convention used by
   * `RunPanelContent` for the review viewer).
   */
  outputArtifactId: ArtifactId | null;
  /** ISO-8601 timestamp of the `StepAwaitingHumanGate` event for this exec. */
  awaitingSince: string;
};

type Deps = {
  state: EngineState;
  templates: TemplateRegistry;
  channels: ChannelContext;
};

export type ListAwaitingHuman = () => Promise<ReadonlyArray<AwaitingHumanRow>>;

export const makeListAwaitingHuman =
  ({ state, templates, channels }: Deps): ListAwaitingHuman =>
  async () => {
    const out: AwaitingHumanRow[] = [];
    for (const instanceId of state.listInstanceIds(channels.getActive())) {
      const instance = state.getInstance(instanceId);
      if (!instance) continue;
      // Skip instances that are no longer actionable (a later StepFailed left
      // earlier awaitingHuman execs hanging — the user can't validate them).
      if (instance.status === "failed" || instance.status === "completed") {
        continue;
      }
      const awaitingExecs = instance.executions.filter(
        (e) => e.status === "awaitingHuman",
      );
      if (awaitingExecs.length === 0) continue;

      // Resolving the template can fail (e.g. registry race or a template that
      // was removed). Skip the instance rather than killing the whole query —
      // an inbox missing one row is better than no inbox at all.
      let template;
      try {
        template = await templates.resolve(
          instance.templateId,
          instance.templateVersion,
        );
      } catch {
        continue;
      }

      const events = state.eventsFor(instanceId);
      for (const exec of awaitingExecs) {
        let stepDef;
        try {
          stepDef = findStep(template, exec.stepId);
        } catch {
          continue;
        }

        // Find the most recent `StepAwaitingHumanGate` event for this exec —
        // re-entries via loops would push a fresh event.
        let awaitingSince: string | null = null;
        for (let i = events.length - 1; i >= 0; i--) {
          const evt = events[i];
          if (
            evt.type === "StepAwaitingHumanGate" &&
            evt.stepExecId === exec.id
          ) {
            awaitingSince = evt.at;
            break;
          }
        }
        if (!awaitingSince) continue;

        out.push({
          instanceId,
          instanceLabel: instanceId.slice(0, 8),
          templateId: instance.templateId,
          templateVersion: instance.templateVersion,
          stepExecId: exec.id,
          stepId: exec.stepId,
          stepName: stepDef.name,
          actorRole: stepDef.actorRole,
          outputArtifactId:
            exec.outputArtifact ?? exec.inputArtifacts[0] ?? null,
          awaitingSince,
        });
      }
    }

    // Oldest first — the spec wants the longest-blocked items at the top.
    out.sort((a, b) =>
      a.awaitingSince < b.awaitingSince
        ? -1
        : a.awaitingSince > b.awaitingSince
          ? 1
          : 0,
    );
    return out;
  };
