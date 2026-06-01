import type { WorkflowTemplate } from "../../domain/template";

/**
 * Built-in template seeds.
 *
 * The seeding machinery (`seedBuiltinTemplates`, `validateSeeds`) stays generic;
 * curated starter templates would be listed in `BUILTIN_TEMPLATE_SEEDS` below.
 *
 * Intentionally empty: a fresh profile — and the state after a « Tout effacer »
 * factory reset — ships no user-facing templates. (Re-add curated seeds here if
 * the product ever wants starter workflows; each entry is structurally and
 * port-validated at boot by `validateSeeds`.)
 */
export const BUILTIN_TEMPLATE_SEEDS: ReadonlyArray<WorkflowTemplate> = [];
