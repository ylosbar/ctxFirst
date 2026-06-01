/**
 * Loads the engine's node-spec catalog over IPC and caches it at module level.
 *
 * The catalog is invariant for a given Electron process — the renderer is
 * relaunched whenever the main process changes — so a single `Promise` cache
 * is enough. Multiple consumers (TemplateEditor, inspector, edge-drop
 * suggestions) share the same fetch.
 *
 * Once the first subscriber has resolved the catalog, we also stash the
 * resolved map in `resolved` so subsequent consumers can read it
 * **synchronously** on first render. This matters for `StepNode`: React Flow
 * lays out handles on the first render and a node that initially renders
 * without handles ends up with broken connectivity even after the handles
 * appear on the next render.
 */
import { useEffect, useState } from "react";
import type { NodeSpecView, StepKindId } from "../../domain/workflow/types";
import { useServices } from "../di/services-provider";
import type { Services } from "../di/services";

export type NodeSpecsState =
  | { status: "loading" }
  | { status: "ready"; byKind: ReadonlyMap<StepKindId, NodeSpecView> }
  | { status: "error"; error: string };

let pending: Promise<ReadonlyMap<StepKindId, NodeSpecView>> | null = null;
let resolved: ReadonlyMap<StepKindId, NodeSpecView> | null = null;

const loadOnce = (
  services: Services,
): Promise<ReadonlyMap<StepKindId, NodeSpecView>> => {
  if (!pending) {
    pending = services
      .listNodeSpecs()
      .then((arr) => {
        const map = new Map(arr.map((s) => [s.kind, s] as const));
        resolved = map;
        return map;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
};

const useNodeSpecs = (): NodeSpecsState => {
  const services = useServices();
  const [state, setState] = useState<NodeSpecsState>(() =>
    resolved ? { status: "ready", byKind: resolved } : { status: "loading" },
  );

  useEffect(() => {
    if (resolved) {
      setState({ status: "ready", byKind: resolved });
      return;
    }
    let cancelled = false;
    loadOnce(services)
      .then((byKind) => {
        if (cancelled) return;
        setState({ status: "ready", byKind });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [services]);

  return state;
};

export default useNodeSpecs;
