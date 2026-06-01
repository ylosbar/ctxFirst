/**
 * Port outbound du chat global piloté par Pi. Le renderer ne parle qu'à ce
 * port — l'adapter `electron-chat-gateway` est l'unique fichier autorisé à
 * toucher `window.api.chat.*` (cf. ARCHITECTURE.md §4).
 */

export type ChatViewContextSnapshot = {
  readonly scope: string;
  readonly label: string;
  readonly data: Record<string, unknown>;
  readonly preferredTools?: ReadonlyArray<string>;
};

export type ChatSessionSummary = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly model: string;
};

export type ChatSession = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly initialContext: ChatViewContextSnapshot | null;
  readonly model: string;
  readonly jsonlPath: string;
  /**
   * Base prompt système snapshoté à la création (persona + style). `null`
   * = défaut. Pour info / debug — la conversation l'utilise figé jusqu'à
   * sa suppression. L'édition globale passe par `SettingsGateway`.
   */
  readonly systemPrompt: string | null;
};

export type ChatEntry =
  | {
      readonly type: "user_message";
      readonly entryId: string;
      readonly text: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "assistant_message";
      readonly entryId: string;
      readonly text: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "tool_use";
      readonly entryId: string;
      readonly toolCallId: string;
      readonly name: string;
      readonly input: unknown;
      readonly timestamp: string;
    }
  | {
      readonly type: "tool_result";
      readonly entryId: string;
      readonly toolCallId: string;
      readonly content: unknown;
      readonly isError: boolean;
      readonly timestamp: string;
    };

export type ChatEvent =
  | { readonly type: "text_delta"; readonly sessionId: string; readonly entryId: string; readonly delta: string }
  | {
      readonly type: "message_complete";
      readonly sessionId: string;
      readonly entryId: string;
      readonly text: string;
    }
  | {
      readonly type: "tool_call_start";
      readonly sessionId: string;
      readonly entryId: string | null;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
    }
  | {
      readonly type: "tool_call_update";
      readonly sessionId: string;
      readonly toolCallId: string;
      readonly partial: unknown;
    }
  | {
      readonly type: "tool_call_complete";
      readonly sessionId: string;
      readonly toolCallId: string;
      readonly result: unknown;
      readonly isError: boolean;
    }
  | {
      readonly type: "tool_confirmation_request";
      readonly sessionId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
    }
  | {
      readonly type: "tool_confirmation_resolved";
      readonly sessionId: string;
      readonly toolCallId: string;
      readonly approved: boolean;
    }
  | {
      /**
       * Taille de contexte courante de la session estimée par l'agent. Émis à
       * l'ouverture puis à chaque tour. `tokens`/`percent` peuvent être `null`
       * tant que l'agent n'a pas d'estimation (ex. juste après compaction).
       */
      readonly type: "context_usage";
      readonly sessionId: string;
      readonly tokens: number | null;
      readonly contextWindow: number;
      readonly percent: number | null;
    }
  | {
      readonly type: "session_ended";
      readonly sessionId: string;
      readonly reason: "completed" | "aborted" | "error";
      readonly error?: string;
    };

export type ContextUsage = {
  readonly tokens: number | null;
  readonly contextWindow: number;
  readonly percent: number | null;
};

export type ChatGateway = {
  listSessions(): Promise<ReadonlyArray<ChatSessionSummary>>;
  createSession(args: {
    initialContext: ChatViewContextSnapshot | null;
    model: string;
    title?: string;
  }): Promise<ChatSession>;
  openSession(id: string): Promise<{ session: ChatSession; replay: ChatEntry[] }>;
  /**
   * Met à jour le modèle d'une session existante. Le handle Pi courant est
   * libéré côté main ; l'UI doit appeler `openSession` derrière pour
   * réinstancier l'agent avec le nouveau modèle.
   */
  setSessionModel(args: { sessionId: string; model: string }): Promise<ChatSession>;
  closeSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  sendMessage(args: {
    sessionId: string;
    userMessage: string;
    /**
     * Snapshot of the active editor's chat context captured at send time.
     * Injected as a per-turn préfixe to the user message by the main process.
     * `null` when the user is on a view without a `getChatContext` extractor.
     */
    liveContext: ChatViewContextSnapshot | null;
  }): Promise<void>;
  abortSession(sessionId: string): Promise<void>;
  /**
   * Route la décision d'autorisation utilisateur vers le `execute` suspendu
   * d'un tool destructif. No-op si la session est déjà fermée ou si le
   * `toolCallId` n'a pas de demande pendante (réponse en double, race avec
   * abort).
   */
  respondToolConfirmation(args: {
    sessionId: string;
    toolCallId: string;
    approved: boolean;
  }): Promise<void>;
  /**
   * S'abonne au stream global des événements Pi. L'UI filtre par
   * `sessionId` puisque plusieurs sessions peuvent être ouvertes en
   * parallèle. Retourne la fonction de désabonnement.
   */
  subscribe(listener: (event: ChatEvent) => void): () => void;
};
