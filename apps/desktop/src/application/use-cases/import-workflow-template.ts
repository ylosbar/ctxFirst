import type { TemplateLayout } from "@shared/wf/layout";
import type {
  TemplateDraft,
  TemplateStepDraft,
  TemplateTransitionDraft,
  TemplateVariableDraft,
} from "../../domain/workflow/types";
import type { SystemGateway } from "../ports/system-gateway";
import type { WorkflowGateway } from "../ports/workflow-gateway";
import { TEMPLATE_EXPORT_SCHEMA_VERSION } from "./export-workflow-template";

export type ParsedBundle = {
  schemaVersion: typeof TEMPLATE_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  template: TemplateDraft;
  layout: TemplateLayout | null;
  dependencies: {
    skillRefs: ReadonlyArray<string>;
    artifactKinds: ReadonlyArray<string>;
  };
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === "string";

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isString);

const requireString = (obj: Record<string, unknown>, key: string, path: string): string => {
  const v = obj[key];
  if (!isString(v) || v.length === 0) {
    throw new Error(`Champ obligatoire manquant : \`${path}\`.`);
  }
  return v;
};

const parseStep = (raw: unknown, idx: number): TemplateStepDraft => {
  if (!isRecord(raw)) {
    throw new Error(`Champ obligatoire manquant : \`template.steps[${idx}]\`.`);
  }
  const id = requireString(raw, "id", `template.steps[${idx}].id`);
  const name = isString(raw["name"]) ? raw["name"] : id;
  const kind = requireString(raw, "kind", `template.steps[${idx}].kind`);
  const actorRoleRaw = raw["actorRole"];
  const actorRole =
    actorRoleRaw === "PO" || actorRoleRaw === "Developer" || actorRoleRaw === "LLMAgent"
      ? actorRoleRaw
      : "Developer";
  const config = isRecord(raw["config"]) ? raw["config"] : {};
  const humanGateRequired = raw["humanGateRequired"] === true;
  const writesTo = isRecord(raw["writesTo"])
    ? (Object.fromEntries(
        Object.entries(raw["writesTo"]).filter(([, v]) => isString(v)),
      ) as Record<string, string>)
    : undefined;
  const readsFrom = isRecord(raw["readsFrom"])
    ? (Object.fromEntries(
        Object.entries(raw["readsFrom"]).filter(([, v]) => isString(v)),
      ) as Record<string, string>)
    : undefined;
  const note = isString(raw["note"]) ? raw["note"] : undefined;
  return {
    id,
    name,
    kind,
    actorRole,
    config,
    humanGateRequired,
    ...(writesTo ? { writesTo } : {}),
    ...(readsFrom ? { readsFrom } : {}),
    ...(note !== undefined ? { note } : {}),
  };
};

const parseTransition = (raw: unknown, idx: number): TemplateTransitionDraft => {
  if (!isRecord(raw)) {
    throw new Error(`Champ obligatoire manquant : \`template.transitions[${idx}]\`.`);
  }
  return {
    from: requireString(raw, "from", `template.transitions[${idx}].from`),
    fromPort: isString(raw["fromPort"]) ? raw["fromPort"] : undefined,
    to: requireString(raw, "to", `template.transitions[${idx}].to`),
    toPort: isString(raw["toPort"]) ? raw["toPort"] : undefined,
    isLoop: raw["isLoop"] === true,
    order: typeof raw["order"] === "number" ? raw["order"] : undefined,
  };
};

const parseVariable = (raw: unknown, idx: number): TemplateVariableDraft => {
  if (!isRecord(raw)) {
    throw new Error(`Champ obligatoire manquant : \`template.variables[${idx}]\`.`);
  }
  const name = requireString(raw, "name", `template.variables[${idx}].name`);
  const kind = requireString(raw, "kind", `template.variables[${idx}].kind`);
  const description = isString(raw["description"]) ? raw["description"] : undefined;
  const defaultValue = isString(raw["defaultValue"]) ? raw["defaultValue"] : undefined;
  const promptAtLaunch = raw["promptAtLaunch"] === true ? true : undefined;
  return {
    name,
    kind: kind as TemplateVariableDraft["kind"],
    ...(description !== undefined ? { description } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(promptAtLaunch !== undefined ? { promptAtLaunch } : {}),
  };
};

/**
 * Validate the bundle envelope and shape just enough to know `saveTemplate`
 * will not crash on basic invariants. The main process is the final authority
 * for deep validation (port wiring, kind compatibility, …).
 */
export const parseExportBundle = (raw: string): ParsedBundle => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide.");
  }
  if (!isRecord(parsed)) {
    throw new Error("Le fichier n'est pas un JSON valide.");
  }
  const schemaVersion = parsed["schemaVersion"];
  if (schemaVersion !== TEMPLATE_EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `Schéma non supporté (attendu ${TEMPLATE_EXPORT_SCHEMA_VERSION}, reçu ${String(schemaVersion)}).`,
    );
  }
  const tpl = parsed["template"];
  if (!isRecord(tpl)) {
    throw new Error("Champ obligatoire manquant : `template`.");
  }
  const id = requireString(tpl, "id", "template.id");
  const version = requireString(tpl, "version", "template.version");
  const name = isString(tpl["name"]) ? tpl["name"] : id;
  const description = isString(tpl["description"]) ? tpl["description"] : "";
  const entryStep = requireString(tpl, "entryStep", "template.entryStep");
  const stepsRaw = tpl["steps"];
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new Error("Champ obligatoire manquant : `template.steps`.");
  }
  const steps = stepsRaw.map((s, i) => parseStep(s, i));
  if (!steps.some((s) => s.id === entryStep)) {
    throw new Error("`entryStep` invalide.");
  }
  const exitStepsRaw = tpl["exitSteps"];
  const exitSteps = isStringArray(exitStepsRaw) ? exitStepsRaw : [];
  const transitions = Array.isArray(tpl["transitions"])
    ? tpl["transitions"].map((t, i) => parseTransition(t, i))
    : [];
  const variables = Array.isArray(tpl["variables"])
    ? tpl["variables"].map((v, i) => parseVariable(v, i))
    : [];
  const statusRaw = tpl["status"];
  const status: "draft" | "published" =
    statusRaw === "published" ? "published" : "draft";

  const template: TemplateDraft = {
    id,
    version,
    name,
    description,
    entryStep,
    exitSteps,
    steps,
    transitions,
    variables,
    status,
  };

  let layout: TemplateLayout | null = null;
  const layoutRaw = parsed["layout"];
  if (isRecord(layoutRaw) && isRecord(layoutRaw["positions"])) {
    layout = layoutRaw as unknown as TemplateLayout;
  }

  const deps = isRecord(parsed["dependencies"]) ? parsed["dependencies"] : {};
  const skillRefs = isStringArray(deps["skillRefs"]) ? deps["skillRefs"] : [];
  const artifactKinds = isStringArray(deps["artifactKinds"]) ? deps["artifactKinds"] : [];

  const exportedAt = isString(parsed["exportedAt"]) ? parsed["exportedAt"] : "";

  return {
    schemaVersion: TEMPLATE_EXPORT_SCHEMA_VERSION,
    exportedAt,
    template,
    layout,
    dependencies: { skillRefs, artifactKinds },
  };
};

/**
 * Tiny deterministic FNV-1a 32-bit hash, hex-encoded. We only use the first 6
 * chars to disambiguate colliding imports — collisions there are user-visible
 * but harmless (we keep bumping with a numeric suffix until the ref is free).
 */
const shortHash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
};

const bumpVersion = (version: string, exportedAt: string, attempt: number): string => {
  const suffix = `-import-${shortHash(exportedAt || version)}`;
  const base = `${version}${suffix}`;
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
};

export type PreparedImport = {
  templateDraft: TemplateDraft;
  layout: TemplateLayout | null;
  renamed: boolean;
};

export const prepareImport = (
  parsed: ParsedBundle,
  existingRefs: ReadonlySet<string>,
): PreparedImport => {
  const originalId = parsed.template.id;
  const originalVersion = parsed.template.version;
  const id = originalId;
  let version = originalVersion;
  let renamed = false;
  let attempt = 0;
  while (existingRefs.has(`${id}@${version}`)) {
    version = bumpVersion(originalVersion, parsed.exportedAt, attempt);
    renamed = true;
    attempt += 1;
    if (attempt > 100) {
      throw new Error("Impossible de trouver une version libre pour l'import.");
    }
  }
  const templateDraft: TemplateDraft = {
    ...parsed.template,
    id,
    version,
    status: "draft",
  };
  return { templateDraft, layout: parsed.layout, renamed };
};

export type ImportOutcome =
  | { kind: "cancelled" }
  | {
      kind: "imported";
      templateRef: string;
      originalRef: string;
      renamed: boolean;
      dependencies: {
        skillRefs: ReadonlyArray<string>;
        artifactKinds: ReadonlyArray<string>;
      };
    };

type Deps = { workflows: WorkflowGateway; system: SystemGateway };

export const makeImportWorkflowTemplate =
  ({ workflows, system }: Deps) =>
  async (opts: {
    existingRefs: ReadonlySet<string>;
  }): Promise<ImportOutcome> => {
    const picked = await system.pickAndReadTextFile({
      title: "Importer un workflow",
      filters: [{ name: "Workflow JSON", extensions: ["json"] }],
    });
    if (!picked) return { kind: "cancelled" };

    const parsed = parseExportBundle(picked.content);
    const { templateDraft, layout, renamed } = prepareImport(parsed, opts.existingRefs);

    await workflows.saveTemplate(templateDraft);
    const templateRef = `${templateDraft.id}@${templateDraft.version}`;
    if (layout) {
      try {
        await workflows.saveTemplateLayout(templateRef, {
          ...layout,
          updatedAt: layout.updatedAt || new Date().toISOString(),
        });
      } catch (e) {
        console.warn("[wf:import] saving layout failed (non-fatal)", e);
      }
    }
    return {
      kind: "imported",
      templateRef,
      originalRef: `${parsed.template.id}@${parsed.template.version}`,
      renamed,
      dependencies: parsed.dependencies,
    };
  };

export type ImportWorkflowTemplate = ReturnType<typeof makeImportWorkflowTemplate>;

export { bumpVersion as _bumpVersionForTest };
