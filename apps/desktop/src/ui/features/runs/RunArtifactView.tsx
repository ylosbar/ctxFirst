import { EmptyState } from "@/components/ui/empty-state";
import ArtifactView from "../../components/ArtifactView";
import { useRunPanelContext } from "../../stores/run-panel-store";

const RunArtifactView = () => {
  const ctx = useRunPanelContext();

  if (!ctx) {
    return (
      <div data-run-artifact className="h-full">
        <EmptyState description="Aucun run actif." />
      </div>
    );
  }

  return (
    <ArtifactView
      title={ctx.stepName}
      artifactId={ctx.selected?.outputArtifact ?? null}
      emptyLabel={
        ctx.selected
          ? "Cette étape n'a pas (encore) produit d'artefact."
          : "Sélectionne une étape pour voir son artefact."
      }
    />
  );
};

export default RunArtifactView;
