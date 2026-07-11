/**
 * Mutations des variables du template, avec cascade dans les nodes.
 *
 * Le state `variables` est possédé par l'orchestrateur (quatrième atome
 * undoable) et injecté ici via `setVariables`. Chaque mutateur appelle
 * `commit()` en tête pour rendre l'opération annulable, puis applique sa
 * sémantique :
 *   - `addVariable` — ajoute une déclaration ;
 *   - `updateVariable` — édite une déclaration ; **seul** un renommage de `name`
 *     cascade dans les `writesTo` / `readsFrom` de chaque step (kind/description
 *     restent locaux à la déclaration) ;
 *   - `deleteVariable` — retire la déclaration, mais **refuse** (no-op) toute
 *     variable encore référencée par un step. Supprimer une variable inutilisée
 *     ne peut laisser aucune référence pendante ; on ne dé-câble donc jamais un
 *     step silencieusement (défense en profondeur, indépendante de l'UI).
 */
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";

import type {
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import { isVariableUsed } from "../graph/variable-usage";

type Options = {
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setVariables: Dispatch<SetStateAction<readonly TemplateVariableDraft[]>>;
  commit: (opts?: { coalesceKey?: string }) => void;
  /**
   * Lecture synchrone des steps courants au moment de l'appel — dérivée du
   * mirror `nodesRef` de l'orchestrateur, pas d'une capture périmée en closure,
   * pour que la garde ne juge jamais « inutilisée » une variable fraîchement
   * câblée.
   */
  getSteps: () => ReadonlyArray<TemplateStepDraft>;
};

export type TemplateVariablesControls = {
  addVariable: (variable: TemplateVariableDraft) => void;
  updateVariable: (
    previousName: string,
    next: TemplateVariableDraft,
  ) => void;
  deleteVariable: (name: string) => void;
};

export const useTemplateVariables = ({
  setNodes,
  setVariables,
  commit,
  getSteps,
}: Options): TemplateVariablesControls => {
  const addVariable = useCallback(
    (variable: TemplateVariableDraft) => {
      commit();
      setVariables((vs) => [...vs, variable]);
    },
    [setVariables, commit],
  );

  // Renaming propagates into every step that references the variable in its
  // `writesTo` / `readsFrom`. Kind / description edits are local to the
  // declaration; only the name change cascades.
  const updateVariable = useCallback(
    (previousName: string, next: TemplateVariableDraft) => {
      commit();
      setVariables((vs) => vs.map((v) => (v.name === previousName ? next : v)));
      if (next.name === previousName) return;
      setNodes((nds) =>
        nds.map((n) => {
          const data = n.data as unknown as TemplateStepDraft & {
            isEntry: boolean;
          };
          let writesTo = data.writesTo;
          let readsFrom = data.readsFrom;
          let mutated = false;
          if (writesTo) {
            const remapped: Record<string, string> = {};
            for (const [port, varName] of Object.entries(writesTo)) {
              if (varName === previousName) {
                remapped[port] = next.name;
                mutated = true;
              } else {
                remapped[port] = varName;
              }
            }
            writesTo = remapped;
          }
          if (readsFrom) {
            const remapped: Record<string, string> = {};
            for (const [port, varName] of Object.entries(readsFrom)) {
              if (varName === previousName) {
                remapped[port] = next.name;
                mutated = true;
              } else {
                remapped[port] = varName;
              }
            }
            readsFrom = remapped;
          }
          if (!mutated) return n;
          return { ...n, data: { ...data, writesTo, readsFrom } };
        }),
      );
    },
    // `setNodes` / `setVariables` sont des props stables ; listées pour
    // exhaustive-deps.
    [setNodes, setVariables, commit],
  );

  const deleteVariable = useCallback(
    (name: string) => {
      // Garde autoritaire : ne JAMAIS supprimer une variable référencée, quel
      // que soit l'appelant (sinon on dé-câblerait silencieusement des steps).
      // No-op sans `commit()` pour ne pas polluer l'historique.
      if (isVariableUsed(getSteps(), name)) return;
      commit();
      setVariables((vs) => vs.filter((v) => v.name !== name));
      // Plus de cascade dans les nodes : une variable inutilisée n'a, par
      // définition, aucune référence `writesTo`/`readsFrom` à purger.
    },
    [getSteps, setVariables, commit],
  );

  return { addVariable, updateVariable, deleteVariable };
};
