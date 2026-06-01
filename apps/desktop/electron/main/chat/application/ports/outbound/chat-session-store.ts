import type {
  ChatSession,
  ChatSessionSummary,
  ChatViewContextSnapshot,
} from "../../../domain/chat-session";

/**
 * Port persistance des sessions de chat. Le contenu de la conversation vit
 * dans le fichier JSONL Pi pointé par `jsonlPath` — ce store ne gère que
 * l'index : id, titre, modèle, chemin du fichier.
 */
export type ChatSessionStore = {
  list(): Promise<ChatSessionSummary[]>;
  insert(session: {
    id: string;
    title: string;
    createdAt: string;
    initialContext: ChatViewContextSnapshot | null;
    model: string;
    jsonlPath: string;
    /**
     * Snapshot du base prompt système au moment de la création. `null` =
     * composer avec le défaut au resume.
     */
    systemPrompt: string | null;
  }): Promise<void>;
  get(id: string): Promise<ChatSession | null>;
  updateTitle(id: string, title: string): Promise<void>;
  updateModel(id: string, model: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Renvoie tous les `jsonlPath` connus — utilisé pour le cleanup des orphelins. */
  listJsonlPaths(): Promise<ReadonlyArray<string>>;
};
