/**
 * Projection stable des événements de session Pi vers une forme adaptée à l'UI
 * (et sérialisable IPC). Le main process mappe les événements bruts du SDK Pi
 * vers cette union pour découpler le renderer du format Pi.
 *
 * Phase A : on relaie ce que l'UI a besoin pour afficher le streaming
 * d'un message assistant et la complétion de la conversation. Les events de
 * tool-calling sont prévus dans l'union pour la Phase B (tools locaux), mais
 * ne sont pas encore émis tant que `customTools` reste vide.
 */
export type ChatEvent =
  | {
      readonly type: "text_delta";
      readonly sessionId: string;
      readonly entryId: string;
      readonly delta: string;
    }
  | {
      readonly type: "message_complete";
      readonly sessionId: string;
      readonly entryId: string;
      /** Texte complet du message assistant (pour réconciliation côté UI). */
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
      /**
       * Phase B : un tool destructif vient d'être appelé par le LLM et attend
       * une confirmation utilisateur avant que son `execute` ne touche l'état.
       * L'UI affiche une carte « Autoriser / Refuser » indexée par `toolCallId` ;
       * le renderer répond via `respondToolConfirmation`.
       */
      readonly type: "tool_confirmation_request";
      readonly sessionId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
    }
  | {
      /**
       * Émis dès que la confirmation est tranchée (réponse user, abort,
       * fermeture de session). Fan-out à toutes les fenêtres pour effacer la
       * carte si l'utilisateur a répondu dans une autre instance.
       */
      readonly type: "tool_confirmation_resolved";
      readonly sessionId: string;
      readonly toolCallId: string;
      readonly approved: boolean;
    }
  | {
      /**
       * Taille de contexte courante de la session, telle qu'estimée par Pi
       * (`getContextUsage`). Émis après chaque tour / message / compaction et
       * une fois à l'ouverture (snapshot du replay). `tokens`/`percent` valent
       * `null` quand Pi ne sait pas encore (ex. juste après compaction, avant
       * la prochaine réponse LLM).
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

/**
 * Entry replayée à l'ouverture d'une session existante. Projection neutre du
 * format JSONL Pi vers une forme stable consommable par l'UI.
 */
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
