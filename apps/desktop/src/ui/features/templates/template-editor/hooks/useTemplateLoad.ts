/**
 * Effet de chargement / amorçage du template à l'ouverture de l'éditeur.
 *
 * Deux branches :
 *   - **template neuf** (ni `editingRef` ni `fromRef`) : amorcé avec une node
 *     « User Input » d'office (tout workflow démarre par la capture d'une seed),
 *     marquée entrée + sélectionnée ;
 *   - **chargement par ref** (`editingRef` en édition, sinon `fromRef` pour une
 *     copie) : fetch parallèle template + layout (un échec de layout, purement
 *     présentationnel, ne casse pas l'ouverture), puis `templateToGraph`. Une
 *     copie repart toujours d'un brouillon : nom `(copie)`, id `-copy`,
 *     `status: "draft"`.
 *
 * Aucun retour — c'est un effet qui écrit dans les setters fournis en options.
 * Le `let cancelled` + cleanup annule les `setState` si l'éditeur se démonte
 * pendant le fetch. Deps reportées à l'identique de l'ancien inline :
 * `[editingRef, fromRef, services, setVariables]` (les autres setters bruts sont
 * stables, reconnus par exhaustive-deps).
 */
import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { TemplateLayout } from "@shared/wf/layout";
import type { TemplateVariableDraft } from "../../../../../domain/workflow/types";
import type { Services } from "../../../../di/services";
import { getKindMeta } from "../../../../components/templates/step-kinds";
import { makeStepId } from "../graph/ids";
import { templateToGraph } from "../graph/template-to-graph";
import { buildDefaultStep } from "../graph/step-spec";

type Options = {
  editingRef: string | null;
  fromRef: string | null;
  services: Services;
  counterRef: MutableRefObject<number>;
  setName: Dispatch<SetStateAction<string>>;
  setTemplateId: Dispatch<SetStateAction<string>>;
  setVersion: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<"draft" | "published">>;
  setDescription: Dispatch<SetStateAction<string>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEntryStepId: Dispatch<SetStateAction<string | null>>;
  setVariables: Dispatch<SetStateAction<ReadonlyArray<TemplateVariableDraft>>>;
  setInitialLayout: Dispatch<SetStateAction<TemplateLayout | null>>;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
};

export const useTemplateLoad = ({
  editingRef,
  fromRef,
  services,
  counterRef,
  setName,
  setTemplateId,
  setVersion,
  setStatus,
  setDescription,
  setNodes,
  setEdges,
  setEntryStepId,
  setVariables,
  setInitialLayout,
  setSelectedNodeId,
  setError,
  setLoading,
}: Options): void => {
  // Load an existing template by ref, or seed a new one from a "from" ref.
  useEffect(() => {
    const sourceRef = editingRef ?? fromRef;
    if (!sourceRef) {
      // Nouveau template (pas une copie) : on l'amorce avec une node
      // « User Input ». Tout workflow démarre par la capture d'une seed, donc
      // ce point d'entrée est toujours nécessaire — autant l'ajouter d'office.
      const kind = getKindMeta("user.input");
      if (kind) {
        const id = makeStepId(kind.id, 1);
        counterRef.current = Math.max(counterRef.current, 1);
        const step = buildDefaultStep(kind, id);
        setNodes([
          {
            id,
            type: "step",
            position: { x: 80, y: 80 },
            data: { ...step, isEntry: true },
          },
        ]);
        setEntryStepId(id);
        setSelectedNodeId(id);
      }
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        // Fetch en parallèle : une erreur sur le layout (purement
        // présentationnel) ne doit pas casser l'ouverture du template.
        const [tpl, layout] = await Promise.all([
          services.getWorkflowTemplate(sourceRef),
          services.getTemplateLayout(sourceRef).catch(() => null),
        ]);
        if (cancelled) return;
        const graph = templateToGraph(tpl, layout);
        if (editingRef) {
          setName(tpl.name);
          setTemplateId(tpl.id);
          setVersion(tpl.version);
          setStatus(tpl.status);
        } else {
          // Une copie repart toujours d'un brouillon : nouvelle ref à publier.
          setName(`${tpl.name} (copie)`);
          setTemplateId(`${tpl.id}-copy`);
          setVersion(tpl.version);
          setStatus("draft");
        }
        setDescription(tpl.description);
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setEntryStepId(graph.entryStepId);
        setVariables(tpl.variables ?? []);
        setInitialLayout(layout);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `setVariables` provient de `useTemplateVariables` (prop stable) : listé
    // pour exhaustive-deps, les autres setters bruts restent reconnus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRef, fromRef, services, setVariables]);
};
