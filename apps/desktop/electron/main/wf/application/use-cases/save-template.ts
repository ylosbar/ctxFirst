import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { ArtifactSchemaRegistry } from "../ports/outbound/artifact-schema-registry";
import { validateTemplate, type WorkflowTemplate } from "../../domain/template";
import type { StepRunnerRegistry } from "../step-runner";
import { buildRefinementResolver, validateTemplatePorts } from "../validate-template-ports";
import { hasWorkflowCall } from "../../domain/services/flatten-template";
import { validateWorkflowCalls, WorkflowCallError } from "../../domain/services/validate-workflow-calls";
import {
  buildWorkflowCallSnapshot,
  snapshotResolve,
} from "../workflow-call-closure";

type Deps = {
  templates: TemplateRegistry;
  runners: StepRunnerRegistry;
  artifactSchemas: ArtifactSchemaRegistry;
};

export type SaveTemplate = (tpl: WorkflowTemplate) => Promise<void>;

export const makeSaveTemplate =
  ({ templates, runners, artifactSchemas }: Deps): SaveTemplate =>
  async (tpl) => {
    validateTemplate(tpl);
    validateTemplatePorts(tpl, runners, artifactSchemas);
    // §8: validate every `workflow.call` against its referenced sub-template —
    // literal ref, published, invocable, exhaustive + kind-compatible bindings,
    // no cycle, bounded depth, and a valid flattened graph. Resolving the
    // closure may fail if a referenced template is absent; surface it as a
    // WorkflowCallError so the editor shows a clean message.
    if (hasWorkflowCall(tpl)) {
      const snapshot = await buildWorkflowCallSnapshot(templates, tpl).catch((err) => {
        throw new WorkflowCallError(
          `workflow.call references a template that could not be resolved: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
      validateWorkflowCalls(tpl, snapshotResolve(snapshot), {
        resolver: buildRefinementResolver(artifactSchemas),
      });
    }
    await templates.save(tpl);
  };
