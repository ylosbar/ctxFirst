/**
 * Port for resolving {@link WorkflowTemplate}s. The MVP ships an in-code
 * registry containing only `feature-from-spec@v1`; a future adapter could
 * serve drafts authored in the visual editor.
 */
import type { TemplateLayout } from "@shared/wf/layout";
import type { TemplateId, TemplateVersion } from "../../../domain/ids";
import type { WorkflowTemplate } from "../../../domain/template";

export interface TemplateRegistry {
  /** Resolves a template by id + version. */
  resolve(id: TemplateId, version: TemplateVersion): Promise<WorkflowTemplate>;
  /**
   * Convenience resolver accepting the canonical `name@version` string used in
   * IPC payloads and step configs.
   */
  resolveRef(ref: string): Promise<WorkflowTemplate>;
  /** Lists every registered template (published and draft). */
  list(): Promise<ReadonlyArray<WorkflowTemplate>>;
  /** Upserts a template by (id, version). Caller must pass a validated template. */
  save(tpl: WorkflowTemplate): Promise<void>;
  /** Renames a template in place. */
  rename(id: TemplateId, version: TemplateVersion, newName: string): Promise<void>;
  /**
   * Reads the editor layout (positions + viewport) stored alongside the
   * template row. Returns `null` if no layout has been saved yet, or if the
   * row doesn't exist.
   */
  getLayout(id: TemplateId, version: TemplateVersion): Promise<TemplateLayout | null>;
  /**
   * Overwrites the layout for `(id, version)`. Idempotent. Throws if the
   * target row doesn't exist (a template that hasn't been saved yet has no
   * row to attach a layout to).
   */
  saveLayout(
    id: TemplateId,
    version: TemplateVersion,
    layout: TemplateLayout,
  ): Promise<void>;
}
