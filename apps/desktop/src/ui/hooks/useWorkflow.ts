import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "../di/services-provider";
import type {
  InstanceView,
  LlmSessionEvent,
  ReviewCommentView,
  TemplateView,
  WfEvent,
} from "../../domain/workflow/types";
import type { StartWorkflowInput } from "../../application/use-cases/start-workflow";

// A coalesced session item. Consecutive `text-delta` events are merged into a
// single item whose `seq` is the first delta's seq and `endSeq` is the last
// delta covered. Non-merged items keep `endSeq === seq`. Structurally
// compatible with `LlmSessionEvent` so downstream consumers that don't care
// about `endSeq` see no difference.
type SessionItem = LlmSessionEvent & { readonly endSeq: number };

type SessionsMap = Readonly<Record<string, ReadonlyArray<SessionItem>>>;

// Coalescing window for event-driven timeline refetches. A burst of workflow
// events (StepStarted/StepValidated/… during an active run) collapses into at
// most one `getWorkflowTimeline` round-trip per window, mirroring the 150 ms
// debounce used for the instance list elsewhere.
const TIMELINE_REFRESH_COALESCE_MS = 150;

type UseWorkflow = {
  instance: InstanceView | null;
  template: TemplateView | null;
  sessions: SessionsMap;
  startWorkflow: (
    input: StartWorkflowInput,
  ) => Promise<{ instanceId: string } | null>;
  validateStep: (stepExecId: string) => Promise<void>;
  requestLoop: (
    stepExecId: string,
    toStepId: string,
    reason: string,
    comments?: ReadonlyArray<ReviewCommentView>,
  ) => Promise<void>;
  rerunFromNode: (
    stepExecId: string,
    configOverride?: Record<string, unknown>,
  ) => Promise<void>;
  loadArtifact: (artifactId: string) => Promise<string>;
  loadSession: (stepExecId: string) => Promise<void>;
  error: string | null;
  busy: boolean;
  loading: boolean;
};

const tryMergeTextDelta = (
  last: SessionItem | undefined,
  ev: LlmSessionEvent,
): SessionItem | null => {
  if (!last) return null;
  if (last.payload.type !== "text-delta") return null;
  if (ev.payload.type !== "text-delta") return null;
  if (ev.seq !== last.endSeq + 1) return null;
  return {
    ...last,
    endSeq: ev.seq,
    payload: {
      type: "text-delta",
      text: last.payload.text + ev.payload.text,
    },
  };
};

const isCovered = (
  prev: ReadonlyArray<SessionItem>,
  seq: number,
): boolean => {
  for (const item of prev) {
    if (seq >= item.seq && seq <= item.endSeq) return true;
  }
  return false;
};

const collapseAdjacent = (items: SessionItem[]): SessionItem[] => {
  const out: SessionItem[] = [];
  for (const item of items) {
    const merged = tryMergeTextDelta(out[out.length - 1], item);
    if (merged && item.payload.type === "text-delta") {
      // Re-merge a full segment range, not just a single seq.
      out[out.length - 1] = {
        ...merged,
        endSeq: item.endSeq,
      };
    } else {
      out.push(item);
    }
  }
  return out;
};

// Merges a batch of raw events into the existing coalesced array. Fast path
// when every batch event lies after the current tail (the live-stream case);
// slow path when replay events backfill an earlier range.
const mergeBatch = (
  prev: ReadonlyArray<SessionItem>,
  batch: ReadonlyArray<LlmSessionEvent>,
): ReadonlyArray<SessionItem> => {
  if (batch.length === 0) return prev;
  const sorted = batch.length === 1 ? batch : [...batch].sort((a, b) => a.seq - b.seq);

  const tailEnd = prev.length > 0 ? prev[prev.length - 1].endSeq : -Infinity;
  if (sorted[0].seq > tailEnd) {
    const result: SessionItem[] = [...prev];
    for (const ev of sorted) {
      const merged = tryMergeTextDelta(result[result.length - 1], ev);
      if (merged) {
        result[result.length - 1] = merged;
      } else {
        result.push({ ...ev, endSeq: ev.seq });
      }
    }
    return result;
  }

  // Slow path: events may interleave with existing segments. Filter out any
  // event whose seq is already covered, then re-sort and collapse adjacent
  // text-delta runs.
  const additions: SessionItem[] = [];
  for (const ev of sorted) {
    if (isCovered(prev, ev.seq)) continue;
    additions.push({ ...ev, endSeq: ev.seq });
  }
  if (additions.length === 0) return prev;
  const combined = [...prev, ...additions].sort((a, b) => a.seq - b.seq);
  return collapseAdjacent(combined);
};

const useWorkflow = (instanceId: string | null): UseWorkflow => {
  const services = useServices();
  const [instance, setInstance] = useState<InstanceView | null>(null);
  const [template, setTemplate] = useState<TemplateView | null>(null);
  const [sessions, setSessions] = useState<SessionsMap>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(instanceId !== null);

  const pendingRef = useRef<Map<string, LlmSessionEvent[]>>(new Map());
  const flushHandleRef = useRef<number | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());
  const timelineRefreshHandleRef = useRef<number | null>(null);

  const flushSessions = useCallback(() => {
    flushHandleRef.current = null;
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    const snapshot: Array<[string, LlmSessionEvent[]]> = [...pending];
    pending.clear();
    setSessions((prev) => {
      let changed = false;
      const next: Record<string, ReadonlyArray<SessionItem>> = { ...prev };
      for (const [stepExecId, batch] of snapshot) {
        const cur = prev[stepExecId] ?? [];
        const merged = mergeBatch(cur, batch);
        if (merged !== cur) {
          next[stepExecId] = merged;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushHandleRef.current !== null) return;
    flushHandleRef.current = requestAnimationFrame(flushSessions);
  }, [flushSessions]);

  const resetSessionBuffers = useCallback(() => {
    if (flushHandleRef.current !== null) {
      cancelAnimationFrame(flushHandleRef.current);
      flushHandleRef.current = null;
    }
    pendingRef.current.clear();
    loadedRef.current.clear();
  }, []);

  const cancelTimelineRefresh = useCallback(() => {
    if (timelineRefreshHandleRef.current !== null) {
      clearTimeout(timelineRefreshHandleRef.current);
      timelineRefreshHandleRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (flushHandleRef.current !== null) {
        cancelAnimationFrame(flushHandleRef.current);
        flushHandleRef.current = null;
      }
      cancelTimelineRefresh();
    };
  }, [cancelTimelineRefresh]);

  const refreshTimeline = useCallback(
    async (id: string) => {
      const view = await services.getWorkflowTimeline(id);
      setInstance(view);
    },
    [services],
  );

  // Coalesce event-driven refetches: the first event arms a timer; subsequent
  // events within the window are dropped (a single refetch already covers
  // them). Guarantees a bounded refresh rate even under a continuous event
  // stream, unlike a trailing debounce which could starve.
  const scheduleTimelineRefresh = useCallback(
    (id: string) => {
      if (timelineRefreshHandleRef.current !== null) return;
      timelineRefreshHandleRef.current = window.setTimeout(() => {
        timelineRefreshHandleRef.current = null;
        refreshTimeline(id).catch((err) => {

          console.error("[wf:ui] refreshTimeline failed", err);
        });
      }, TIMELINE_REFRESH_COALESCE_MS);
    },
    [refreshTimeline],
  );

  useEffect(() => {
    // A pending coalesced refresh targets the previous instance; drop it. The
    // immediate refetch below (or the cleared state) supersedes it.
    cancelTimelineRefresh();
    if (!instanceId) {
      setInstance(null);
      setSessions({});
      resetSessionBuffers();
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSessions({});
    resetSessionBuffers();
    refreshTimeline(instanceId)
      .catch((err) => {
         
        console.error("[wf:ui] refreshTimeline failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instanceId, refreshTimeline, resetSessionBuffers, cancelTimelineRefresh]);

  const templateRef = instance
    ? `${instance.templateId}@${instance.templateVersion}`
    : null;

  useEffect(() => {
    if (!templateRef) {
      setTemplate(null);
      return;
    }
    let cancelled = false;
    services
      .getWorkflowTemplate(templateRef)
      .then((tpl) => {
        if (!cancelled) setTemplate(tpl);
      })
      .catch((err) => {
         
        console.error("[wf:ui] getWorkflowTemplate failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [services, templateRef]);

  useEffect(() => {
    const handleEvent = (evt: WfEvent) => {
      if (!instanceId) return;
      if (evt.instanceId !== instanceId) return;
      scheduleTimelineRefresh(instanceId);
    };
    const handleSession = (ev: LlmSessionEvent) => {
      const buf = pendingRef.current.get(ev.stepExecId);
      if (buf) {
        buf.push(ev);
      } else {
        pendingRef.current.set(ev.stepExecId, [ev]);
      }
      scheduleFlush();
    };
    const unsub = services.subscribeWorkflow({
      onEvent: handleEvent,
      onLlmSession: handleSession,
    });
    return () => {
      unsub();
    };
  }, [services, scheduleTimelineRefresh, instanceId, scheduleFlush]);

  const loadSession = useCallback(
    async (stepExecId: string): Promise<void> => {
      if (loadedRef.current.has(stepExecId)) return;
      loadedRef.current.add(stepExecId);
      try {
        const events = await services.getLlmSession(stepExecId);
        setSessions((prev) => {
          const cur = prev[stepExecId] ?? [];
          const merged = mergeBatch(cur, events);
          return merged === cur ? prev : { ...prev, [stepExecId]: merged };
        });
      } catch (e) {
        loadedRef.current.delete(stepExecId);
         
        console.error("[wf:ui] loadSession failed", e);
      }
    },
    [services],
  );

  const startWorkflow = useCallback(
    async (
      input: StartWorkflowInput,
    ): Promise<{ instanceId: string } | null> => {
      setError(null);
      setBusy(true);
      try {
        const result = await services.startWorkflow(input);
        return result;
      } catch (e) {
         
        console.error("[wf:ui] startWorkflow failed", e);
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [services],
  );

  const validateStep = useCallback(
    async (stepExecId: string) => {
      if (!instanceId) return;
      setError(null);
      try {
        await services.validateStep(instanceId, stepExecId);
      } catch (e) {
         
        console.error("[wf:ui] validateStep failed", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [services, instanceId],
  );

  const requestLoop = useCallback(
    async (
      stepExecId: string,
      toStepId: string,
      reason: string,
      comments?: ReadonlyArray<ReviewCommentView>,
    ) => {
      if (!instanceId) return;
      setError(null);
      try {
        await services.requestLoop({
          instanceId,
          stepExecId,
          toStepId,
          reason,
          comments,
        });
      } catch (e) {
         
        console.error("[wf:ui] requestLoop failed", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [services, instanceId],
  );

  const rerunFromNode = useCallback(
    async (
      stepExecId: string,
      configOverride?: Record<string, unknown>,
    ) => {
      if (!instanceId) return;
      setError(null);
      try {
        await services.requestRerun({ instanceId, stepExecId, configOverride });
      } catch (e) {

        console.error("[wf:ui] rerunFromNode failed", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [services, instanceId],
  );

  const loadArtifact = useCallback(
    async (artifactId: string): Promise<string> => {
      const { content } = await services.getArtifact(artifactId);
      return content;
    },
    [services],
  );

  return useMemo(
    () => ({
      instance,
      template,
      sessions,
      startWorkflow,
      validateStep,
      requestLoop,
      rerunFromNode,
      loadArtifact,
      loadSession,
      error,
      busy,
      loading,
    }),
    [
      instance,
      template,
      sessions,
      startWorkflow,
      validateStep,
      requestLoop,
      rerunFromNode,
      loadArtifact,
      loadSession,
      error,
      busy,
      loading,
    ],
  );
};

export default useWorkflow;
