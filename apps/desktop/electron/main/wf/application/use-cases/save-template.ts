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
import {
  hasTemplateInvoke,
  TemplateInvokeError,
  templateInvokeRefKey,
} from "../../domain/services/template-invoke";
import { validateTemplateInvokes } from "../../domain/services/validate-template-invokes";
import { buildTemplateInvokeSnapshot } from "../template-invoke-closure";

type Deps = {
  templates: TemplateRegistry;
  runners: StepRunnerRegistry;
  artifactSchemas: ArtifactSchemaRegistry;
};

export type SaveTemplate = (tpl: WorkflowTemplate) => Promise<void>;

/** Thrown when attempting to overwrite an already-published (immutable) ref. */
export class TemplateImmutableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateImmutableError";
  }
}

export const makeSaveTemplate =
  ({ templates, runners, artifactSchemas }: Deps): SaveTemplate =>
  async (tpl) => {
    validateTemplate(tpl);
    // Immutabilité : une fois `published`, la ref `(id, version)` est figée — on
    // refuse toute ré-écriture, l'auteur itère en bumpant la version. Même
    // garde-fou que côté MCP (`ctxfirst_save_template`). `resolve` lève si la
    // ref est absente : on convertit en `null` (rien à protéger), et la garde
    // ne mord donc que sur une ré-écriture d'une ref déjà publiée.
    const existing = await templates
      .resolve(tpl.id, tpl.version)
      .catch(() => null);
    if (existing && existing.status === "published") {
      throw new TemplateImmutableError(
        `${tpl.id}@${tpl.version} est publié (immuable). ` +
          "Crée une nouvelle version (ex. v2) pour itérer.",
      );
    }
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
    // §10/§14: validate every `template.invoke` against its referenced
    // sub-template — literal ref, published, invocable, exhaustive +
    // kind-compatible bindings, no cycle, bounded depth. Approach A spawns a
    // child instead of inlining, so cycle/depth are walked over the reference
    // graph rather than via flattening.
    if (hasTemplateInvoke(tpl)) {
      const snapshot = await buildTemplateInvokeSnapshot(templates, tpl).catch((err) => {
        throw new TemplateInvokeError(
          `template.invoke references a template that could not be resolved: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
      validateTemplateInvokes(
        tpl,
        (ref) => snapshot.get(templateInvokeRefKey(ref)),
        { resolver: buildRefinementResolver(artifactSchemas) },
      );
    }
    await templates.save(tpl);
  };
