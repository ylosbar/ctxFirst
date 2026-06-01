/**
 * Port carrying the `contributions.stepKinds[].suggestedFor` hints declared by
 * plugin manifests. Consumed by the template editor to surface code-actions
 * (`"plugin X suggests the node Y for this input kind"`) without resorting to
 * an implicit, type-level resolution.
 *
 * Replaces the smart default that parser-as-option used to provide (cf.
 * `specs/artifact-typing-overhaul.md` §Pilier B).
 */
import type { ArtifactKind } from "../../../domain/artifact";

/** One suggestion as surfaced to the renderer. */
export type StepKindSuggestion = {
  /** Step kind id (`plugin:<id>:<name>` or builtin). */
  stepKindId: string;
  /** Localized label, mirrors the manifest's `stepKinds[].label`. */
  label: string;
  /** Optional icon hint from the manifest. */
  icon?: string;
  /** Plugin id surfacing the suggestion (e.g. `linear`). */
  pluginId: string;
  /** Input kind the suggestion is tied to (echoed for the UI). */
  inputKind: ArtifactKind;
  /** Free-form tag the UI may group/sort by (e.g. `"context-simplifier"`). */
  role?: string;
};

/** Plugin-contributed suggestions, snapshotted at activation time. */
export type PluginStepKindSuggestionContribution = {
  pluginId: string;
  suggestions: ReadonlyArray<{
    stepKindId: string;
    label: string;
    icon?: string;
    inputKind: ArtifactKind;
    role?: string;
  }>;
};

export interface StepKindSuggestionRegistry {
  /** Suggestions whose `inputKind` matches `kind`, in registration order. */
  forInputKind(kind: ArtifactKind): ReadonlyArray<StepKindSuggestion>;
  /**
   * Replaces the current set of plugin contributions. Called from the
   * composition root after the plugin loader has run / re-run.
   */
  setPluginContributions(
    contributions: ReadonlyArray<PluginStepKindSuggestionContribution>,
  ): void;
}
