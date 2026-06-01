import type { ChatEvent } from "../../../chat-event-types";

/**
 * Port abstrait pour une session d'agent multi-tour. Le seul adapter en v1
 * est Pi (`@earendil-works/pi-coding-agent`) — mais le port garde le reste
 * de l'app ignorant du SDK exact.
 *
 * Phase A : on n'expose pas encore `customTools` (Phase B). Le `systemPrompt`
 * passe pour la base/préambule ; en Phase B il sera enrichi avec le contexte
 * de vue et les instructions utilisateur.
 */
export type AgentSessionGateway = {
  createSession(args: {
    sessionId: string;
    /** Chemin absolu du fichier JSONL Pi. Phase A : toujours fourni (mode "create" ou "open"). */
    jsonlPath: string;
    /** Mode "create" pour une nouvelle session, "open" pour resume. */
    mode: "create" | "open";
    /** Prompt système. Phase A : préambule statique seul. */
    systemPrompt: string;
    /** Identifiant Pi du modèle, ex. "openrouter:anthropic/claude-3.5-sonnet". */
    model: string;
    /** Callback invoqué à chaque événement de session, mappé en `ChatEvent`. */
    onEvent: (event: ChatEvent) => void;
  }): Promise<AgentSessionHandle>;
};

export type AgentSessionHandle = {
  readonly sessionId: string;
  /** Envoie un message user. Résoud quand le tour est terminé (ou aborted). */
  prompt(text: string): Promise<void>;
  /** Annule le tour en cours. Le `session_ended` event suit avec `reason: "aborted"`. */
  abort(): Promise<void>;
  /** Libère le handle Pi. Appeler quand l'UI ferme/abandonne la session. */
  close(): Promise<void>;
  /**
   * Route la réponse user vers le `execute` suspendu d'un tool destructif.
   * No-op silencieux si le `toolCallId` n'a pas (ou plus) de demande pendante.
   */
  respondConfirmation(toolCallId: string, approved: boolean): void;
};
