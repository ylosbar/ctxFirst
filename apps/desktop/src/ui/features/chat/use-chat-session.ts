/**
 * Hook qui pilote une session de chat ouverte côté main : envoie un message,
 * accumule les deltas de streaming, expose la timeline d'items (text, tool_use,
 * tool_result).
 *
 * Stratégie d'état :
 *   - On garde une `timeline` ordonnée d'items hétérogènes (text user/assistant,
 *     tool_use, tool_result) qui reflète l'ordre d'arrivée des events.
 *   - Un `streaming` séparé contient le texte assistant en cours, indexé par
 *     `entryId`. À `message_complete`, on le fusionne dans la timeline.
 *   - Les events sont filtrés par `sessionId` à la source (chaque hook
 *     mémorise son id) parce que le stream IPC est global.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatEntry,
  ChatEvent,
  ChatGateway,
  ChatSession,
  ContextUsage,
  ChatViewContextSnapshot,
} from "@/application/ports/chat-gateway";

export type ChatTimelineItem =
  | {
      readonly kind: "text";
      readonly entryId: string;
      readonly role: "user" | "assistant";
      readonly text: string;
      readonly timestamp: string;
    }
  | {
      readonly kind: "tool_use";
      readonly toolCallId: string;
      readonly name: string;
      readonly input: unknown;
      readonly status: "running" | "completed" | "errored";
    }
  | {
      readonly kind: "tool_result";
      readonly toolCallId: string;
      readonly content: unknown;
      readonly isError: boolean;
    };

/** Demande de confirmation pendante pour un tool destructif (Phase B). */
export type PendingConfirmation = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: unknown;
};

type State = {
  session: ChatSession | null;
  timeline: ChatTimelineItem[];
  /** Texte assistant en cours de streaming, indexé par entryId. */
  streaming: Record<string, string>;
  isStreaming: boolean;
  error: string | null;
  /** Demandes de confirmation en attente, indexées par `toolCallId`. */
  pendingConfirmations: Record<string, PendingConfirmation>;
  /** Taille de contexte courante (tokens / fenêtre) ; `null` tant qu'inconnue. */
  contextUsage: ContextUsage | null;
};

const initialState: State = {
  session: null,
  timeline: [],
  streaming: {},
  isStreaming: false,
  error: null,
  pendingConfirmations: {},
  contextUsage: null,
};

const replayToTimeline = (replay: ChatEntry[]): ChatTimelineItem[] => {
  const items: ChatTimelineItem[] = replay.map((e) => {
    if (e.type === "user_message" || e.type === "assistant_message") {
      return {
        kind: "text",
        entryId: e.entryId,
        role: e.type === "user_message" ? "user" : "assistant",
        text: e.text,
        timestamp: e.timestamp,
      };
    }
    if (e.type === "tool_use") {
      return {
        kind: "tool_use",
        toolCallId: e.toolCallId,
        name: e.name,
        input: e.input,
        status: "running",
      };
    }
    return {
      kind: "tool_result",
      toolCallId: e.toolCallId,
      content: e.content,
      isError: e.isError,
    };
  });

  // Deuxième pass : promouvoir chaque tool_use en completed/errored si son
  // tool_result est présent en aval. Sinon (crash mid-tool), reste "running".
  const resultByCallId = new Map<string, { isError: boolean }>();
  for (const item of items) {
    if (item.kind === "tool_result") {
      resultByCallId.set(item.toolCallId, { isError: item.isError });
    }
  }
  return items.map((item) => {
    if (item.kind !== "tool_use") return item;
    const r = resultByCallId.get(item.toolCallId);
    if (!r) return item;
    return { ...item, status: r.isError ? "errored" : "completed" };
  });
};

export const useChatSession = (
  gateway: ChatGateway,
  sessionId: string | null,
) => {
  const [state, setState] = useState<State>(initialState);
  // Epoch incrémenté à chaque changement de modèle pour re-déclencher
  // l'effet d'`openSession` (le main vient de libérer le handle Pi : on
  // doit le réinstancier avec le nouveau modèle).
  const [reopenEpoch, setReopenEpoch] = useState(0);
  // Ref pour que les handlers d'events vus par `subscribe` aient toujours
  // l'id à jour (évite un re-subscribe à chaque changement de session).
  const activeIdRef = useRef<string | null>(sessionId);
  activeIdRef.current = sessionId;
  // « Toujours autoriser pour cette session » : mémorisé en ref pour pouvoir
  // décider depuis le handler d'event (qui ne dépend pas de l'état React) et
  // pour préserver l'allowlist quand l'utilisateur switche puis revient.
  // Reset quand la session change (cf. effet d'open/close).
  const autoApprovedRef = useRef<Set<string>>(new Set());

  // Open / close la session quand l'id change. La promesse d'`openSession`
  // peut résoudre après un changement d'id rapide ; on garde un compteur
  // `epoch` pour ignorer les résultats périmés.
  useEffect(() => {
    if (!sessionId) {
      setState(initialState);
      autoApprovedRef.current = new Set();
      return;
    }
    let cancelled = false;
    setState({ ...initialState, isStreaming: false });
    autoApprovedRef.current = new Set();
    gateway
      .openSession(sessionId)
      .then(({ session, replay }) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          session,
          timeline: replayToTimeline(replay),
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
        }));
      });
    return () => {
      cancelled = true;
      // Fire-and-forget : on n'a pas besoin d'attendre la fermeture pour
      // continuer le démontage. Si elle échoue, on log mais on ne ré-affiche
      // pas (l'UI a déjà bougé).
      void gateway.closeSession(sessionId).catch((err) => {
        console.warn("[chat] closeSession failed:", err);
      });
    };
  }, [gateway, sessionId, reopenEpoch]);

  // Abonnement unique au stream global. On filtre les events à l'arrivée
  // par `sessionId` courant.
  useEffect(() => {
    const unsub = gateway.subscribe((ev: ChatEvent) => {
      const id = activeIdRef.current;
      if (!id || ev.sessionId !== id) return;
      // Auto-approve : si l'utilisateur a coché « Toujours autoriser » pour
      // ce tool, on court-circuite l'affichage du prompt et on répond `true`
      // tout de suite. Fire-and-forget : si l'IPC échoue, l'UI verra la
      // résolution arriver via `tool_confirmation_resolved` (ou non).
      if (
        ev.type === "tool_confirmation_request" &&
        autoApprovedRef.current.has(ev.toolName)
      ) {
        void gateway
          .respondToolConfirmation({
            sessionId: ev.sessionId,
            toolCallId: ev.toolCallId,
            approved: true,
          })
          .catch((err) => {
            console.warn("[chat] auto-approve respondToolConfirmation failed:", err);
          });
        return;
      }
      setState((s) => applyEvent(s, ev));
    });
    return unsub;
  }, [gateway]);

  const sendMessage = useCallback(
    async (text: string, liveContext: ChatViewContextSnapshot | null): Promise<void> => {
      const id = sessionId;
      if (!id || !text.trim()) return;
      // Ajout optimiste du message user — le JSONL Pi l'écrira à son tour,
      // mais en attendant on veut l'afficher immédiatement.
      const optimisticEntryId = `local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      setState((s) => ({
        ...s,
        timeline: [
          ...s.timeline,
          {
            kind: "text",
            entryId: optimisticEntryId,
            role: "user",
            text,
            timestamp: new Date().toISOString(),
          },
        ],
        isStreaming: true,
        error: null,
      }));
      try {
        await gateway.sendMessage({ sessionId: id, userMessage: text, liveContext });
      } catch (err) {
        setState((s) => ({
          ...s,
          isStreaming: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [gateway, sessionId],
  );

  const abort = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    await gateway.abortSession(sessionId);
  }, [gateway, sessionId]);

  const changeModel = useCallback(
    async (model: string): Promise<void> => {
      const id = sessionId;
      if (!id) return;
      try {
        await gateway.setSessionModel({ sessionId: id, model });
        // Force le effect d'`openSession` à re-tourner avec le nouveau
        // modèle — il fait `closeSession` puis ré-instancie le handle Pi.
        setReopenEpoch((n) => n + 1);
      } catch (err) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [gateway, sessionId],
  );

  const respondConfirmation = useCallback(
    async (
      toolCallId: string,
      approved: boolean,
      opts?: { always?: boolean },
    ): Promise<void> => {
      const id = sessionId;
      if (!id) return;
      // « Toujours autoriser » : on enregistre le `toolName` *avant* d'envoyer
      // la réponse, pour que les prochaines demandes du même tool soient
      // auto-approuvées même si elles arrivent avant que `setState` ait
      // retiré la demande courante.
      if (approved && opts?.always) {
        const entry = state.pendingConfirmations[toolCallId];
        if (entry) autoApprovedRef.current.add(entry.toolName);
      }
      await gateway.respondToolConfirmation({
        sessionId: id,
        toolCallId,
        approved,
      });
    },
    [gateway, sessionId, state.pendingConfirmations],
  );

  return {
    session: state.session,
    timeline: state.timeline,
    streaming: state.streaming,
    isStreaming: state.isStreaming,
    error: state.error,
    pendingConfirmations: state.pendingConfirmations,
    contextUsage: state.contextUsage,
    sendMessage,
    abort,
    respondConfirmation,
    changeModel,
  };
};

const applyEvent = (state: State, ev: ChatEvent): State => {
  switch (ev.type) {
    case "text_delta":
      // Pi nous redonne le texte assistant *complet* à chaque update (cf.
      // pi-agent-session-gateway:mapPiEvent) — on remplace, on ne concatène pas.
      return {
        ...state,
        streaming: { ...state.streaming, [ev.entryId]: ev.delta },
        isStreaming: true,
      };
    case "message_complete": {
      // Fusionne le streaming vers timeline, retire-le du buffer.
      const { [ev.entryId]: _removed, ...rest } = state.streaming;
      return {
        ...state,
        streaming: rest,
        timeline: [
          ...state.timeline,
          {
            kind: "text",
            entryId: ev.entryId,
            role: "assistant",
            text: ev.text,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }
    case "tool_call_start":
      return {
        ...state,
        timeline: [
          ...state.timeline,
          {
            kind: "tool_use",
            toolCallId: ev.toolCallId,
            name: ev.toolName,
            input: ev.args,
            status: "running",
          },
        ],
        isStreaming: true,
      };
    case "tool_call_update":
      return {
        ...state,
        timeline: state.timeline.map((item) =>
          item.kind === "tool_use" && item.toolCallId === ev.toolCallId
            ? { ...item, input: ev.partial }
            : item,
        ),
      };
    case "tool_call_complete": {
      let matched = false;
      const updated = state.timeline.flatMap((item): ChatTimelineItem[] => {
        if (item.kind === "tool_use" && item.toolCallId === ev.toolCallId) {
          matched = true;
          return [
            { ...item, status: ev.isError ? "errored" : "completed" },
            {
              kind: "tool_result",
              toolCallId: ev.toolCallId,
              content: ev.result,
              isError: ev.isError,
            },
          ];
        }
        return [item];
      });
      if (!matched) {
        console.warn(
          `[chat] tool_call_complete for unknown toolCallId=${ev.toolCallId} (no matching tool_use)`,
        );
      }
      return { ...state, timeline: updated };
    }
    case "tool_confirmation_request":
      return {
        ...state,
        pendingConfirmations: {
          ...state.pendingConfirmations,
          [ev.toolCallId]: {
            toolCallId: ev.toolCallId,
            toolName: ev.toolName,
            args: ev.args,
          },
        },
      };
    case "tool_confirmation_resolved": {
      // Idempotent — la résolution peut arriver depuis n'importe quelle
      // source (réponse user, abort, fermeture, autre fenêtre).
      if (!state.pendingConfirmations[ev.toolCallId]) return state;
      const { [ev.toolCallId]: _removed, ...rest } = state.pendingConfirmations;
      return { ...state, pendingConfirmations: rest };
    }
    case "context_usage":
      return {
        ...state,
        contextUsage: {
          tokens: ev.tokens,
          contextWindow: ev.contextWindow,
          percent: ev.percent,
        },
      };
    case "session_ended":
      return {
        ...state,
        isStreaming: false,
        error: ev.reason === "error" && ev.error ? ev.error : state.error,
      };
    default:
      return state;
  }
};
