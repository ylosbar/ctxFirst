import type { TemplateLayout } from "@shared/wf/layout";
import type {
  TemplateDraft,
  TemplateStepDraft,
  TemplateView,
} from "../../domain/workflow/types";
import type { SystemGateway } from "../ports/system-gateway";
import type { WorkflowGateway } from "../ports/workflow-gateway";

export const TEMPLATE_EXPORT_SCHEMA_VERSION = 1 as const;

export type TemplateExportBundle = {
  $schema: "https://ctxfirst.app/schemas/template-export.v1.json";
  schemaVersion: typeof TEMPLATE_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  exportedBy: { app: "ctxfirst-desktop"; appVersion?: string };
  template: TemplateDraft;
  layout: TemplateLayout | null;
  dependencies: {
    skillRefs: ReadonlyArray<string>;
    artifactKinds: ReadonlyArray<string>;
  };
};

const viewToDraft = (tpl: TemplateView): TemplateDraft => ({
  id: tpl.id,
  version: tpl.version,
  name: tpl.name,
  description: tpl.description,
  entryStep: tpl.entryStep,
  exitSteps: tpl.exitSteps,
  steps: tpl.steps.map(
    (s): TemplateStepDraft => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      actorRole: s.actorRole,
      config: s.config ?? {},
      humanGateRequired: s.humanGateRequired,
      writesTo: s.writesTo,
      readsFrom: s.readsFrom,
      note: s.note,
    }),
  ),
  transitions: tpl.transitions.map((t) => ({
    from: t.from,
    fromPort: t.fromPort,
    to: t.to,
    toPort: t.toPort,
    isLoop: t.isLoop,
    order: t.order,
  })),
  variables: tpl.variables,
  status: tpl.status,
});

const DYNAMIC_KIND_RE = /^(user:|plugin:)/;

const isString = (v: unknown): v is string => typeof v === "string";

export const collectTemplateDependencies = (
  template: Pick<TemplateView | TemplateDraft, "steps">,
): { skillRefs: ReadonlyArray<string>; artifactKinds: ReadonlyArray<string> } => {
  const skillRefs = new Set<string>();
  const artifactKinds = new Set<string>();
  for (const step of template.steps) {
    const cfg = (step.config ?? {});
    const skillRef = cfg["skillRef"];
    if (isString(skillRef) && skillRef.length > 0) {
      skillRefs.add(skillRef);
    }
    for (const key of ["outputKind", "inputKind", "itemKind", "k"]) {
      const v = cfg[key];
      if (isString(v) && DYNAMIC_KIND_RE.test(v)) {
        artifactKinds.add(v);
      }
    }
  }
  return {
    skillRefs: Array.from(skillRefs).sort(),
    artifactKinds: Array.from(artifactKinds).sort(),
  };
};

export const buildExportBundle = (
  tpl: TemplateView,
  layout: TemplateLayout | null,
  options: { exportedAt?: string; appVersion?: string } = {},
): TemplateExportBundle => ({
  $schema: "https://ctxfirst.app/schemas/template-export.v1.json",
  schemaVersion: TEMPLATE_EXPORT_SCHEMA_VERSION,
  exportedAt: options.exportedAt ?? new Date().toISOString(),
  exportedBy: {
    app: "ctxfirst-desktop",
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
  },
  template: viewToDraft(tpl),
  layout,
  dependencies: collectTemplateDependencies(tpl),
});

const slugify = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "workflow";

type Deps = { workflows: WorkflowGateway; system: SystemGateway };

export const makeExportWorkflowTemplate =
  ({ workflows, system }: Deps) =>
  async (templateRef: string): Promise<{ path: string | null }> => {
    const [tpl, layout] = await Promise.all([
      workflows.getTemplate(templateRef),
      workflows.getTemplateLayout(templateRef).catch(() => null),
    ]);
    const bundle = buildExportBundle(tpl, layout);
    const safeName = slugify(`${tpl.name}-${tpl.id}-${tpl.version}`);
    const path = await system.saveTextFile({
      content: JSON.stringify(bundle, null, 2),
      defaultFileName: `${safeName}.workflow.json`,
      title: "Exporter le workflow",
      filters: [{ name: "Workflow JSON", extensions: ["json"] }],
    });
    return { path };
  };

export type ExportWorkflowTemplate = ReturnType<typeof makeExportWorkflowTemplate>;
