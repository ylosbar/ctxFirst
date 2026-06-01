import type {
  TemplateDraft,
  TemplateView,
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
