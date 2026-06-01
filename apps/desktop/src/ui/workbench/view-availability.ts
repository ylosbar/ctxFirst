import { useEffect, useSyncExternalStore } from "react";
import type { ViewId } from "./types";

// Lightweight pub/sub for "is this view currently available?". Features
// register an availability flag (e.g. the template inspector is only
// available when a node or edge is selected). The Workbench layout reads
// the flag to decide whether to render the host sidebar at all.
//
// Views without a registered entry are treated as available — `whenEditor`
// and `activity` predicates remain the primary eligibility gate.

const availability = new Map<ViewId, boolean>();
const listeners = new Set<() => void>();
let version = 0;

const fire = () => {
  version += 1;
  for (const listener of listeners) listener();
};

export const viewAvailability = {
  set(id: ViewId, available: boolean): void {
    if (availability.get(id) === available) return;
    availability.set(id, available);
    fire();
  },
  remove(id: ViewId): void {
    if (!availability.has(id)) return;
    availability.delete(id);
    fire();
  },
  isAvailable(id: ViewId): boolean {
    return availability.get(id) ?? true;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getVersion(): number {
    return version;
  },
} as const;

export const useViewAvailabilityVersion = (): number =>
  useSyncExternalStore(
    viewAvailability.subscribe,
    viewAvailability.getVersion,
    () => 0,
  );

export const useRegisterViewAvailability = (
  viewId: ViewId,
  available: boolean,
): void => {
  useEffect(() => {
    viewAvailability.set(viewId, available);
  }, [viewId, available]);
  useEffect(() => {
    return () => {
      viewAvailability.remove(viewId);
    };
  }, [viewId]);
};
