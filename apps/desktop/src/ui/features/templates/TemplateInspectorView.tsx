import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Section } from "@/components/ui/section";
import StepInspector from "../../components/templates/StepInspector";
import { useActiveTemplateCanvas } from "../../stores/template-canvas-store";
import StudioPanel from "./studio/StudioPanel";

const TemplateInspectorView = () => {
  const canvas = useActiveTemplateCanvas();
  const [studioStepId, setStudioStepId] = useState<string | null>(null);

  // Si l'utilisateur change de node sélectionnée, le studio se ferme
  // implicitement — le studio est attaché à un step précis. Idem si la
  // selection est vidée. (Cohérent avec "no persistence" : on jette le state).
  const selectedId = canvas?.selectedStep?.id ?? null;
  useEffect(() => {
    if (studioStepId !== null && studioStepId !== selectedId) {
      setStudioStepId(null);
    }
  }, [studioStepId, selectedId]);

  if (!canvas) {
    return <EmptyState description="Aucun template actif." />;
  }

  if (!canvas.mutationEnabled) {
    return <EmptyState description="Édition désactivée pour un run en cours." />;
  }

  if (canvas.selectedStep) {
    if (studioStepId === canvas.selectedStep.id) {
      return (
        <StudioPanel
          step={canvas.selectedStep}
          variables={canvas.variables}
          onExit={() => setStudioStepId(null)}
        />
      );
    }
    return (
      <ScrollArea data-template-editor className="h-full">
        <StepInspector
          step={canvas.selectedStep}
          isEntry={canvas.isSelectedEntry}
          variables={canvas.variables}
          onChange={canvas.updateSelectedStep}
          onDelete={canvas.deleteSelectedStep}
          onSetEntry={canvas.setSelectedAsEntry}
          onRequestCreateSkill={() =>
            canvas.onRequestCreateSkill(canvas.selectedStep!.id)
          }
          onEnterStudio={() => setStudioStepId(canvas.selectedStep!.id)}
        />
      </ScrollArea>
    );
  }

  if (canvas.selectedEdge) {
    return (
      <div data-template-editor>
        <Section
          className="p-3 text-sm"
          title="Transition"
          description={`${canvas.selectedEdge.source} → ${canvas.selectedEdge.target}`}
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={canvas.deleteSelectedEdge}
            >
              Supprimer
            </Button>
          }
        >
          <FormField orientation="inline" label="Boucle de feedback (dashed)">
            <Checkbox
              checked={canvas.selectedEdge.isLoop}
              onCheckedChange={() => canvas.toggleSelectedEdgeLoop()}
            />
          </FormField>
        </Section>
      </div>
    );
  }

  return (
    <EmptyState description="Sélectionne un nœud ou une arête pour l'éditer." />
  );
};

export default TemplateInspectorView;
