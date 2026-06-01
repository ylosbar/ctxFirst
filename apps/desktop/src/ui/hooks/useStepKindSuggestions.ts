import { useEffect, useState } from "react";
import { useServices } from "../di/services-provider";
import type {
  ArtifactKind,
  StepKindSuggestionView,
} from "../../domain/workflow/types";

type State = {
  suggestions: ReadonlyArray<StepKindSuggestionView>;
  loading: boolean;
};

/**
 * Fetches plugin-contributed step kinds flagged `suggestedFor.inputKind === kind`.
 * Used by the template editor to surface non-intrusive code-actions when a
 * user wires a kind into a downstream step (cf.
 * `specs/artifact-typing-overhaul.md` §Pilier B).
 *
 * Pass `null` / `undefined` to disable the fetch (returns an empty array).
 */
const useStepKindSuggestions = (
  inputKind: ArtifactKind | null | undefined,
): State => {
  const services = useServices();
  const [state, setState] = useState<State>({
    suggestions: [],
    loading: Boolean(inputKind),
  });

  useEffect(() => {
    if (!inputKind) {
      setState({ suggestions: [], loading: false });
      return;
    }
    let alive = true;
    setState((p) => ({ ...p, loading: true }));
    void services
      .listStepKindSuggestions(inputKind)
      .then((suggestions) => {
        if (!alive) return;
        setState({ suggestions, loading: false });
      })
      .catch(() => {
        if (!alive) return;
        setState({ suggestions: [], loading: false });
      });
    return () => {
      alive = false;
    };
  }, [services, inputKind]);

  return state;
};

export default useStepKindSuggestions;
