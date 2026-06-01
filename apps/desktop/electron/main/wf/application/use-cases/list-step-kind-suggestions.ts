import type { ArtifactKind } from "../../domain/artifact";
import type {
  StepKindSuggestion,
  StepKindSuggestionRegistry,
} from "../ports/outbound/step-kind-suggestions";

type Deps = { stepKindSuggestions: StepKindSuggestionRegistry };

export type ListStepKindSuggestions = (
  inputKind: ArtifactKind,
) => Promise<ReadonlyArray<StepKindSuggestion>>;

/**
 * Returns plugin-contributed step kinds flagged as `suggestedFor.inputKind === kind`.
 * The template editor consumes this to render code-actions next to a wired
 * input — non-intrusive replacement for the parser-as-option smart default.
 */
export const makeListStepKindSuggestions =
  ({ stepKindSuggestions }: Deps): ListStepKindSuggestions =>
  async (inputKind) => stepKindSuggestions.forInputKind(inputKind);
