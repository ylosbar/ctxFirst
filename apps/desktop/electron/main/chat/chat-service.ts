/**
 * Service "chat" côté main. Garde une `Map<sessionId, AgentSessionHandle>`
 * des sessions actuellement ouvertes (handles Pi en mémoire) et expose les
 * opérations consommées par l'IPC.
 *
 * Une session est "ouverte" tant que l'UI en a besoin (panneau monté +
 * conversation sélectionnée). À la fermeture, on libère le handle Pi mais on
 * garde la ligne SQLite + le fichier JSONL — la session peut être reprise
 * plus tard.
 */
import crypto from "node:crypto";
import path from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import type { AgentSessionGateway, AgentSessionHandle } from "./application/ports/outbound/agent-session-gateway";
import type { ChatSessionStore } from "./application/ports/outbound/chat-session-store";
import type { ChatEvent, ChatEntry } from "./chat-event-types";
import type {
  ChatSession,
  ChatSessionSummary,
  ChatViewContextSnapshot,
} from "./domain/chat-session";
import { formatLiveContextPreamble, systemPromptForContext } from "./system-prompt";
import { loadChatEntries } from "./replay";

type CreateArgs = {
  /** Snapshot du contexte de vue (Phase B). Phase A : toujours null côté UI. */
  initialContext: ChatViewContextSnapshot | null;
  /** Identifiant Pi du modèle (ex. "openrouter:anthropic/claude-3.5-sonnet"). */
  model: string;
  /** Titre initial — défaut généré si vide. */
  title?: string;
};

type SendArgs = {
  sessionId: string;
  userMessage: string;
  /**
   * Snapshot du contexte de vue capturé côté renderer au moment du clic
   * "Envoyer". Préfixé au message user avant de pousser à Pi pour que le
   * LLM voit ce que l'utilisateur regarde *maintenant*. Null si l'utilisateur
   * est sur une vue sans extracteur ou si le renderer n'a rien envoyé
   * (backward-compat).
   */
  liveContext: ChatViewContextSnapshot | null;
};

type OpenResult = {
  session: ChatSession;
  replay: ChatEntry[];
};

export type ChatService = {
  listSessions(): Promise<ChatSessionSummary[]>;
  createSession(args: CreateArgs): Promise<ChatSession>;
  /**
   * Ouvre (ou rouvre) une session : instancie un handle Pi, branche le
   * stream d'événements sur `onEvent`, et renvoie le replay des entries
   * déjà persistées dans le JSONL.
   */
  openSession(id: string, onEvent: (e: ChatEvent) => void): Promise<OpenResult>;
  /**
   * Bascule la session sur un autre modèle (ex. depuis le sélecteur de la
   * chatbox). Le handle Pi courant est libéré ; le caller doit refaire un
   * `openSession()` derrière pour réinstancier l'agent avec le nouveau modèle.
   * L'historique JSONL n'est pas touché.
   */
  setSessionModel(args: { sessionId: string; model: string }): Promise<ChatSession>;
  sendMessage(args: SendArgs): Promise<void>;
  abortSession(sessionId: string): Promise<void>;
  /**
   * Phase B : route la réponse user (Autoriser / Refuser) vers le `execute`
   * suspendu d'un tool destructif. No-op si la session est fermée ou si la
   * demande n'est plus pendante.
   */
  respondToolConfirmation(args: {
    sessionId: string;
    toolCallId: string;
    approved: boolean;
  }): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  /** Libère tous les handles Pi à l'arrêt de l'app. */
  shutdown(): Promise<void>;
};

type Deps = {
  store: ChatSessionStore;
  gateway: AgentSessionGateway;
  /** Répertoire où Pi écrit ses fichiers JSONL. Créé si absent. */
  sessionsDir: string;
  /**
   * Résout la valeur globale courante du base prompt système (`chat.systemPrompt`
   * dans les Settings). Appelé seulement à `createSession` — le `openSession`
   * relit le snapshot persisté pour respecter la promesse "nouvelles
   * conversations seulement".
   */
  getChatSystemPrompt: () => string | null;
};

const defaultTitle = (createdAt: string): string => {
  const d = new Date(createdAt);
  return `Conversation ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
};

export const createChatService = ({
  store,
  gateway,
  sessionsDir,
  getChatSystemPrompt,
}: Deps): ChatService => {
  // Handles Pi vivants, indexés par sessionId. Plusieurs sessions peuvent être
  // ouvertes en parallèle (l'utilisateur peut switcher entre conversations).
  const handles = new Map<string, AgentSessionHandle>();

  const ensureSessionsDir = async (): Promise<void> => {
    await mkdir(sessionsDir, { recursive: true });
  };

  const buildJsonlPath = (id: string): string => path.join(sessionsDir, `${id}.jsonl`);

  const closeHandle = async (sessionId: string): Promise<void> => {
    const handle = handles.get(sessionId);
    if (!handle) return;
    handles.delete(sessionId);
    try {
      await handle.close();
    } catch (err) {
      console.error(`[chat:service] close failed for ${sessionId}:`, err);
    }
  };

  return {
    async listSessions() {
      return store.list();
    },

    async createSession({ initialContext, model, title }) {
      await ensureSessionsDir();
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const jsonlPath = buildJsonlPath(id);
      const finalTitle = title?.trim() || defaultTitle(createdAt);
      // Snapshot du base prompt à l'instant T : c'est ce qui garantit
      // "nouvelles conversations seulement" — toute édition ultérieure du
      // global ne touche pas les sessions déjà créées.
      const systemPrompt = getChatSystemPrompt();
      await store.insert({
        id,
        title: finalTitle,
        createdAt,
        initialContext,
        model,
        jsonlPath,
        systemPrompt,
      });
      return {
        id,
        title: finalTitle,
        createdAt,
        initialContext,
        model,
        jsonlPath,
        systemPrompt,
      };
    },

    async openSession(id, onEvent) {
      const session = await store.get(id);
      if (!session) throw new Error(`Chat session not found: ${id}`);

      // Idempotent : si déjà ouverte, on libère l'ancien handle (l'UI a
      // probablement été démontée puis remontée sans `closeSession`).
      await closeHandle(id);

      // Compose depuis le snapshot persisté de la session, jamais depuis les
      // Settings courants — l'édition globale ne doit pas muter une session
      // déjà créée. `null` → `DEFAULT_CHAT_BASE_PROMPT` (rétro-compat des
      // sessions pré-v19 / non personnalisées).
      const systemPrompt = systemPromptForContext({ basePrompt: session.systemPrompt });
      // Le fichier existe-t-il déjà ? S'il a été créé mais aucun message
      // n'a été envoyé, le fichier peut être absent — on tombe alors en
      // mode "create" pour la première session, "open" sinon.
      const replay = await loadChatEntriesSafe(session.jsonlPath);
      const mode: "create" | "open" = replay.length === 0 ? "create" : "open";

      const handle = await gateway.createSession({
        sessionId: id,
        jsonlPath: session.jsonlPath,
        mode,
        systemPrompt,
        model: session.model,
        onEvent,
      });
      handles.set(id, handle);
      return { session, replay };
    },

    async setSessionModel({ sessionId, model }) {
      const trimmed = model.trim();
      if (!trimmed) throw new Error("Model must not be empty");
      const existing = await store.get(sessionId);
      if (!existing) throw new Error(`Chat session not found: ${sessionId}`);
      if (existing.model === trimmed) return existing;
      // Drop the live Pi handle — the renderer is expected to call
      // openSession again, which will instantiate a new agent with the new
      // model and re-attach the event stream.
      await closeHandle(sessionId);
      await store.updateModel(sessionId, trimmed);
      return { ...existing, model: trimmed };
    },

    async sendMessage({ sessionId, userMessage, liveContext }) {
      const handle = handles.get(sessionId);
      if (!handle) {
        throw new Error(`Chat session not open: ${sessionId}. Call openSession() first.`);
      }
      const wrapped = liveContext
        ? formatLiveContextPreamble(liveContext) + userMessage
        : userMessage;
      await handle.prompt(wrapped);
    },

    async abortSession(sessionId) {
      const handle = handles.get(sessionId);
      if (!handle) return;
      await handle.abort();
    },

    async respondToolConfirmation({ sessionId, toolCallId, approved }) {
      const handle = handles.get(sessionId);
      if (!handle) return;
      handle.respondConfirmation(toolCallId, approved);
    },

    async closeSession(sessionId) {
      await closeHandle(sessionId);
    },

    async deleteSession(sessionId) {
      await closeHandle(sessionId);
      const session = await store.get(sessionId);
      await store.delete(sessionId);
      if (session) {
        try {
          await unlink(session.jsonlPath);
        } catch (err) {
          // Fichier déjà absent (cleanup manuel, wipe-db, etc.) → no-op.
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`[chat:service] unlink failed for ${session.jsonlPath}:`, err);
          }
        }
      }
    },

    async shutdown() {
      const ids = [...handles.keys()];
      await Promise.allSettled(ids.map((id) => closeHandle(id)));
    },
  };
};

/**
 * Lit les entries d'un JSONL Pi en tolérant l'absence du fichier (cas d'une
 * session créée mais jamais utilisée).
 */
const loadChatEntriesSafe = async (jsonlPath: string): Promise<ChatEntry[]> => {
  try {
    return loadChatEntries(jsonlPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.warn(`[chat:service] failed to load JSONL ${jsonlPath}:`, err);
    return [];
  }
};
