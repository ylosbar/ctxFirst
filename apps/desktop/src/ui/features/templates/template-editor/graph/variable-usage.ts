/**
 * Surface d'usage d'une variable de template — source de vérité unique.
 *
 * Une variable n'est pas un node du graphe : c'est un slot typé relié aux ports
 * des steps par deux maps `port → nomVariable` portées par chaque step,
 * `writesTo` (production) et `readsFrom` (consommation). Ces deux maps sont la
 * surface d'usage **complète** — aucune autre construction (transitions, edges,
 * interpolation `{{…}}`, `defaultValue`, bindings `workflow.call`) ne nomme
 * directement une variable (les bindings d'interface sont stockés comme
 * `readsFrom`/`writesTo` ordinaires).
 *
 * Ce module remplace le `collectReferences` local à `VariableEditorModal` et
 * alimente aussi la garde de `deleteVariable` et le menu Variables — modale,
 * menu et commande partagent donc le même prédicat, si bien qu'aucune surface
 * ne peut autoriser ce qu'une autre bloque.
 *
 * Pur (aucune closure sur le state React) → testable unitairement.
 */
import type { TemplateStepDraft } from "../../../../../domain/workflow/types";

export type VariableReferences = {
  readonly producers: readonly string[]; // step ids qui writesTo la variable
  readonly consumers: readonly string[]; // step ids qui readsFrom la variable
};

/** Scanne writesTo/readsFrom de tous les steps — la surface d'usage COMPLÈTE. */
export const collectVariableReferences = (
  steps: ReadonlyArray<TemplateStepDraft>,
  name: string,
): VariableReferences => {
  const producers: string[] = [];
  const consumers: string[] = [];
  for (const s of steps) {
    if (s.writesTo && Object.values(s.writesTo).includes(name)) {
      producers.push(s.id);
    }
    if (s.readsFrom && Object.values(s.readsFrom).includes(name)) {
      consumers.push(s.id);
    }
  }
  return { producers, consumers };
};

/** Vrai ssi au moins un step lit ou écrit la variable. */
export const isVariableUsed = (
  steps: ReadonlyArray<TemplateStepDraft>,
  name: string,
): boolean => {
  const { producers, consumers } = collectVariableReferences(steps, name);
  return producers.length > 0 || consumers.length > 0;
};

/** Ensemble des variables référencées au moins une fois (pour griser une liste). */
export const collectUsedVariableNames = (
  steps: ReadonlyArray<TemplateStepDraft>,
): ReadonlySet<string> => {
  const used = new Set<string>();
  for (const s of steps) {
    if (s.writesTo) for (const v of Object.values(s.writesTo)) used.add(v);
    if (s.readsFrom) for (const v of Object.values(s.readsFrom)) used.add(v);
  }
  return used;
};
