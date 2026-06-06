import { Section } from "@/components/ui/section";
import type {
  ArtifactKind,
  NodeSpecView,
} from "../../../../../domain/workflow/types";
import useStepKindSuggestions from "../../../../hooks/useStepKindSuggestions";
import { useT } from "../../../../i18n";

type SuggestedNodesProps = {
  spec: NodeSpecView;
};

/**
 * Lists plugin-contributed step kinds whose manifest declared
 * `suggestedFor.inputKind === K` for one of this step's input kinds. Renders
 * as a non-intrusive code-action panel (no auto-insertion — user picks).
 * Hidden when no suggestion applies.
 *
 * Replaces the type-level "smart default" parser-as-option used to provide
 * (cf. `specs/artifact-typing-overhaul.md` §Pilier B).
 */
const SuggestedNodes = ({ spec }: SuggestedNodesProps) => {
  const concreteKinds = Array.from(
    new Set(
      spec.inputs.flatMap((p) =>
        p.kinds.filter((k): k is ArtifactKind => k !== "*"),
      ),
    ),
  );
  return (
    <>
      {concreteKinds.map((kind) => (
        <SuggestedNodesForKind key={kind} inputKind={kind} />
      ))}
    </>
  );
};

const SuggestedNodesForKind = ({ inputKind }: { inputKind: ArtifactKind }) => {
  const t = useT();
  const { suggestions } = useStepKindSuggestions(inputKind);
  if (suggestions.length === 0) return null;
  return (
    <Section
      title={t("template.stepInspector.suggestions.title", { kind: inputKind })}
      description={t("template.stepInspector.suggestions.description")}
      variant="panel"
      density="compact"
      collapsible
      defaultOpen
      persistKey={`app.step-inspector.suggestions.${inputKind}`}
      className="px-2 py-2"
    >
      <ul className="flex flex-col">
        {suggestions.map((s) => (
          <li
            key={s.stepKindId}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
          >
            <span className="font-mono">{s.label}</span>
            <span className="rounded bg-muted px-1 text-2xs uppercase text-muted-foreground">
              {t("template.stepInspector.suggestions.pluginBadge", { pluginId: s.pluginId })}
            </span>
            {s.role ? (
              <span className="rounded bg-accent px-1 text-2xs text-accent-foreground">
                {s.role}
              </span>
            ) : null}
            <span className="ml-auto truncate font-mono text-2xs text-muted-foreground">
              {s.stepKindId}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
};

export default SuggestedNodes;
