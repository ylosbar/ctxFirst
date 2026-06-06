import type { TemplateVariableDraft } from "../../../../../domain/workflow/types";

/**
 * State of the variable create/edit modal, owned by the editor orchestrator and
 * shared with the toolbar (which opens it) and the modals subcomponent (which
 * renders it).
 */
export type VariableModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; variable: TemplateVariableDraft };
