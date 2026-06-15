import {
  BUILTIN_ARTIFACT_KINDS,
  type TemplateDraft,
  type TemplateView,
} from "../../domain/workflow/types";

export type MissingDepEntry = {
  ref: string;
  usedBySteps: ReadonlyArray<string>;
};

export type MissingDeps = {
  skillRefs: ReadonlyArray<MissingDepEntry>;
  artifactKinds: ReadonlyArray<MissingDepEntry>;
};

const DYNAMIC_KIND_RE = /^(user:|plugin:)/;

const isString = (v: unknown): v is string => typeof v === "string";

const pushUsage = (
  bucket: Map<string, Set<string>>,
  ref: string,
  stepId: string,
): void => {
  let set = bucket.get(ref);
  if (!set) {
    set = new Set<string>();
    bucket.set(ref, set);
  }
  set.add(stepId);
};

const toEntries = (bucket: Map<string, Set<string>>): MissingDepEntry[] =>
  Array.from(bucket.entries())
    .map(([ref, steps]) => ({ ref, usedBySteps: Array.from(steps).sort() }))
    .sort((a, b) => a.ref.localeCompare(b.ref));

/**
 * Walks `template.steps` and reports skill refs / artifact kinds referenced
 * by step configs that are absent from `available`. Pure function — meant
 * to be memoized on `(template, skills, artifactSchemas)` in the editor.
 */
export const collectMissingTemplateDeps = (
  template: TemplateView | TemplateDraft,
  available: {
    skillRefs: ReadonlySet<string>;
    artifactKinds: ReadonlySet<string>;
  },
): MissingDeps => {
  const missingSkills = new Map<string, Set<string>>();
  const missingKinds = new Map<string, Set<string>>();
  for (const step of template.steps) {
    const cfg = (step.config ?? {});
    const skillRef = cfg["skillRef"];
    if (
      isString(skillRef) &&
      skillRef.length > 0 &&
      !available.skillRefs.has(skillRef)
    ) {
      pushUsage(missingSkills, skillRef, step.id);
    }
    for (const key of ["outputKind", "inputKind", "itemKind", "k"]) {
      const v = cfg[key];
      if (
        isString(v) &&
        DYNAMIC_KIND_RE.test(v) &&
        !available.artifactKinds.has(v)
      ) {
        pushUsage(missingKinds, v, step.id);
      }
    }
  }
  return {
    skillRefs: toEntries(missingSkills),
    artifactKinds: toEntries(missingKinds),
  };
};

export const totalMissing = (m: MissingDeps): number =>
  m.skillRefs.length + m.artifactKinds.length;

// ── Full dependency listing (not just the missing ones) ──────────────────────

/** One referenced dependency + the steps that use it + whether it resolves. */
export type TemplateDepEntry = {
  ref: string;
  usedBySteps: ReadonlyArray<string>;
  /** `true` when the ref exists in the catalog (or is a builtin kind). */
  resolved: boolean;
};

export type TemplateDeps = {
  skillRefs: ReadonlyArray<TemplateDepEntry>;
  artifactKinds: ReadonlyArray<TemplateDepEntry>;
  subTemplates: ReadonlyArray<TemplateDepEntry>;
};

/** Config keys whose value is an artifact-kind discriminator. */
const KIND_CONFIG_KEYS = ["outputKind", "inputKind", "itemKind", "k"] as const;
/** Step kind that references another template (cf. `WorkflowCallConfig`). */
const WORKFLOW_CALL_KIND = "workflow.call";

const isBuiltinKind = (ref: string): boolean =>
  Object.prototype.hasOwnProperty.call(BUILTIN_ARTIFACT_KINDS, ref);

const toResolvedEntries = (
  bucket: Map<string, Set<string>>,
  resolve: (ref: string) => boolean,
): TemplateDepEntry[] =>
  Array.from(bucket.entries())
    .map(([ref, steps]) => ({
      ref,
      usedBySteps: Array.from(steps).sort(),
      resolved: resolve(ref),
    }))
    .sort((a, b) => a.ref.localeCompare(b.ref));

/**
 * Walks `template.steps` + `template.variables` and reports **every** dependency
 * the template carries — skill/prompt refs, artifact kinds (builtin and
 * dynamic), and referenced sub-templates (`workflow.call`) — each annotated with
 * the steps that use it and whether it resolves against `available`. Sibling of
 * {@link collectMissingTemplateDeps} (which keeps only the unresolved subset);
 * pure, meant to be memoized on `(template, available)` in the editor.
 */
export const collectTemplateDeps = (
  template: TemplateView | TemplateDraft,
  available: {
    skillRefs: ReadonlySet<string>;
    artifactKinds: ReadonlySet<string>;
    subTemplates: ReadonlySet<string>;
  },
): TemplateDeps => {
  const skills = new Map<string, Set<string>>();
  const kinds = new Map<string, Set<string>>();
  const subs = new Map<string, Set<string>>();

  // Variable name → kind, so a kind referenced only through a step's
  // writesTo/readsFrom binding is still attributed to that step below.
  const kindByVariable = new Map<string, string>();
  for (const variable of template.variables) {
    kindByVariable.set(variable.name, variable.kind);
    // A declared variable kind is a dependency even if no step binds it yet.
    if (!kinds.has(variable.kind)) kinds.set(variable.kind, new Set());
  }

  for (const step of template.steps) {
    const cfg = step.config ?? {};

    const skillRef = cfg["skillRef"];
    if (isString(skillRef) && skillRef.length > 0) {
      pushUsage(skills, skillRef, step.id);
    }

    for (const key of KIND_CONFIG_KEYS) {
      const v = cfg[key];
      if (isString(v) && v.length > 0) pushUsage(kinds, v, step.id);
    }

    if (step.kind === WORKFLOW_CALL_KIND) {
      const id = cfg["templateId"];
      const ver = cfg["templateVersion"];
      if (isString(id) && id.length > 0 && isString(ver) && ver.length > 0) {
        pushUsage(subs, `${id}@${ver}`, step.id);
      }
    }

    for (const bindings of [step.writesTo, step.readsFrom]) {
      if (!bindings) continue;
      for (const variableName of Object.values(bindings)) {
        const kind = kindByVariable.get(variableName);
        if (kind) pushUsage(kinds, kind, step.id);
      }
    }
  }

  return {
    skillRefs: toResolvedEntries(skills, (ref) => available.skillRefs.has(ref)),
    artifactKinds: toResolvedEntries(
      kinds,
      (ref) => isBuiltinKind(ref) || available.artifactKinds.has(ref),
    ),
    subTemplates: toResolvedEntries(subs, (ref) =>
      available.subTemplates.has(ref),
    ),
  };
};

export const totalTemplateDeps = (d: TemplateDeps): number =>
  d.skillRefs.length + d.artifactKinds.length + d.subTemplates.length;
