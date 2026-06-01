/**
 * In-memory adapter for the {@link StepKindSuggestionRegistry} port. Snapshots
 * the plugin contributions and indexes them by `inputKind` for cheap lookups
 * (the editor calls `forInputKind` on every render of a wired step inspector).
 */
import type { ArtifactKind } from "../../domain/artifact";
import type {
  PluginStepKindSuggestionContribution,
  StepKindSuggestion,
  StepKindSuggestionRegistry,
} from "../../application/ports/outbound/step-kind-suggestions";

export const createInMemoryStepKindSuggestionRegistry =
  (): StepKindSuggestionRegistry => {
    let byInputKind = new Map<ArtifactKind, StepKindSuggestion[]>();

    return {
      forInputKind(kind: ArtifactKind): ReadonlyArray<StepKindSuggestion> {
        return byInputKind.get(kind) ?? [];
      },

      setPluginContributions(
        contributions: ReadonlyArray<PluginStepKindSuggestionContribution>,
      ): void {
        const next = new Map<ArtifactKind, StepKindSuggestion[]>();
        for (const { pluginId, suggestions } of contributions) {
          for (const s of suggestions) {
            const entry: StepKindSuggestion = {
              stepKindId: s.stepKindId,
              label: s.label,
              icon: s.icon,
              pluginId,
              inputKind: s.inputKind,
              role: s.role,
            };
            const bucket = next.get(s.inputKind) ?? [];
            bucket.push(entry);
            next.set(s.inputKind, bucket);
          }
        }
        byInputKind = next;
      },
    };
  };
