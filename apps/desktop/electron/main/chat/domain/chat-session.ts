/**
 * Domain types for the global chat feature. A chat session is an index entry
 * (SQLite) pointing to a Pi-managed JSONL file on disk. The content of the
 * conversation lives in the JSONL — we never duplicate it here.
 *
 * Phase A : ni `initialContext` (Phase B), ni `globalInstructions` /
 * `sessionInstructions` (Phase B également). Le contrat reste extensible :
 * `initialContext` est typé sérialisable pour accueillir le snapshot du jour
 * où la feature de contexte de vue arrivera.
 */

/**
 * Snapshot du contexte de vue actif au moment où la session a été créée.
 * Sérialisable JSON pour persistance dans `initial_context_json`. Le contenu
 * exact (champs `scope`/`label`/`data`/`preferredTools`) est défini côté
 * renderer ; côté main on traite la valeur comme opaque.
 */
export type ChatViewContextSnapshot = {
  readonly scope: string;
  readonly label: string;
  readonly data: Record<string, unknown>;
  readonly preferredTools?: ReadonlyArray<string>;
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
   * = utiliser `DEFAULT_CHAT_BASE_PROMPT` ; la section "tools" est toujours
   * concaténée par `systemPromptForContext` quoi qu'il arrive. Garanti
   * stable sur toute la vie de la session — le resume relit cette valeur,
   * jamais les Settings courants.
   */
  readonly systemPrompt: string | null;
};

/** Vue allégée pour la liste — pas de `jsonlPath` (détail d'implémentation). */
export type ChatSessionSummary = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly model: string;
};
