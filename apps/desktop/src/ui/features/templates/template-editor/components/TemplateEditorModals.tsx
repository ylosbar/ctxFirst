import type { Dispatch, SetStateAction } from "react";

import TemplateMissingDepsModal from "../../TemplateMissingDepsModal";
import TemplateDependenciesModal from "../../TemplateDependenciesModal";
import TemplateSaveMissingModal from "../../TemplateSaveMissingModal";
import TemplatePublishModal from "../../TemplatePublishModal";
import VariableEditorModal from "../../VariableEditorModal";
import type {
  MissingDeps,
  TemplateDeps,
} from "../../../../../application/use-cases/collect-missing-template-deps";
import type {
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import type { TemplateSaveControls } from "../hooks/useTemplateSave";
import type { TemplateVariablesControls } from "../hooks/useTemplateVariables";
import type { VariableModalState } from "./variable-modal";

type Props = {
  readonly missingDepsModalOpen: boolean;
  readonly setMissingDepsModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly missingDeps: MissingDeps;
  readonly depsModalOpen: boolean;
  readonly setDepsModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly deps: TemplateDeps;
  readonly missingFieldsModal: TemplateSaveControls["missingFieldsModal"];
  readonly setMissingFieldsModal: TemplateSaveControls["setMissingFieldsModal"];
  readonly handleMissingFieldsConfirm: TemplateSaveControls["handleMissingFieldsConfirm"];
  readonly publishConfirmOpen: boolean;
  readonly setPublishConfirmOpen: Dispatch<SetStateAction<boolean>>;
  readonly confirmPublish: TemplateSaveControls["confirmPublish"];
  readonly name: string;
  readonly templateId: string;
  readonly version: string;
  readonly busy: boolean;
  readonly variableModal: VariableModalState;
  readonly setVariableModal: Dispatch<SetStateAction<VariableModalState>>;
  readonly variables: readonly TemplateVariableDraft[];
  readonly steps: ReadonlyArray<TemplateStepDraft>;
  readonly addVariable: TemplateVariablesControls["addVariable"];
  readonly updateVariable: TemplateVariablesControls["updateVariable"];
  readonly deleteVariable: TemplateVariablesControls["deleteVariable"];
};

const TemplateEditorModals = ({
  missingDepsModalOpen,
  setMissingDepsModalOpen,
  missingDeps,
  depsModalOpen,
  setDepsModalOpen,
  deps,
  missingFieldsModal,
  setMissingFieldsModal,
  handleMissingFieldsConfirm,
  publishConfirmOpen,
  setPublishConfirmOpen,
  confirmPublish,
  name,
  templateId,
  version,
  busy,
  variableModal,
  setVariableModal,
  variables,
  steps,
  addVariable,
  updateVariable,
  deleteVariable,
}: Props) => {
  return (
    <>
      <TemplateMissingDepsModal
        open={missingDepsModalOpen}
        onOpenChange={setMissingDepsModalOpen}
        missing={missingDeps}
      />
      <TemplateDependenciesModal
        open={depsModalOpen}
        onOpenChange={setDepsModalOpen}
        deps={deps}
      />
      <TemplateSaveMissingModal
        open={missingFieldsModal !== null}
        missing={missingFieldsModal?.fields ?? []}
        initial={{ name, id: templateId, version }}
        busy={busy}
        onConfirm={(values) => void handleMissingFieldsConfirm(values)}
        onCancel={() => setMissingFieldsModal(null)}
      />
      <TemplatePublishModal
        open={publishConfirmOpen}
        templateRef={`${templateId}@${version}`}
        busy={busy}
        onConfirm={() => void confirmPublish()}
        onCancel={() => setPublishConfirmOpen(false)}
      />
      <VariableEditorModal
        open={variableModal.open}
        mode={
          variableModal.open && variableModal.mode === "edit"
            ? { kind: "edit", variable: variableModal.variable }
            : { kind: "create" }
        }
        variables={variables}
        steps={steps}
        onSubmit={(next, previousName) => {
          if (previousName === null) addVariable(next);
          else updateVariable(previousName, next);
          setVariableModal({ open: false });
        }}
        onDelete={
          variableModal.open && variableModal.mode === "edit"
            ? () => {
                deleteVariable(variableModal.variable.name);
                setVariableModal({ open: false });
              }
            : undefined
        }
        onOpenChange={(o) => {
          if (!o) setVariableModal({ open: false });
        }}
      />
    </>
  );
};

export default TemplateEditorModals;
