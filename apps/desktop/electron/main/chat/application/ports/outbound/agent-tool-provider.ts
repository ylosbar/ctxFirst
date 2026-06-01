/**
 * Port outbound : fournit les tools locaux à exposer au LLM via la session Pi,
 * sans révéler au module `chat` le `WfEngine` ni le SDK MCP. L'adapter Pi
 * consomme ce port pour câbler les `customTools` de `createAgentSession`.
 *
 * `invoke` exerce le handler in-process et renvoie le texte concaténé des
 * content blocks (miroir de `invokeMcpTool` du module `mcp`).
 */

/**
 * Typologie d'un paramètre de tool, réutilise la classification de
 * `describeParam` (`mcp/tools.ts`). `"json"` couvre tous les types non-scalaires
 * (record/object/array) — l'adapter Pi les expose comme `Type.Unknown()` et la
 * validation forte reste celle de Zod côté handler.
 */
export type LocalToolParam = {
  readonly name: string;
  readonly description: string;
  readonly kind: "string" | "number" | "boolean" | "json";
  readonly optional: boolean;
};

export type LocalToolSpec = {
  readonly name: string;
  /** Description envoyée au LLM (le `title`/`description` du ToolDescriptor). */
  readonly description: string;
  readonly params: ReadonlyArray<LocalToolParam>;
  /** true ⇒ confirmation utilisateur requise avant exécution (ex. ctxfirst_save_skill). */
  readonly destructive: boolean;
};

export type AgentToolProvider = {
  list(): ReadonlyArray<LocalToolSpec>;
  invoke(name: string, args: Record<string, unknown>): Promise<{ text: string }>;
};
