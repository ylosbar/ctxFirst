/**
 * Port abstracting the user-level settings store. The plaintext API key
 * never crosses this boundary on read — only a status object exposing
 * presence and the last 4 chars (for UX confirmation). Writes still take
 * the plaintext key, which the adapter forwards to the main process.
 */
import type {
  GitLabTokenStatus,
  LinearApiKeyStatus,
} from "../../domain/settings/types";

export type { GitLabTokenStatus, LinearApiKeyStatus };

/** Snapshot of the OpenRouter credentials store managed by the main process. */
export type OpenRouterStatus = {
  hasApiKey: boolean;
  lastFour: string | null;
  defaultModel: string;
  /** User-curated list of model ids. Always includes `defaultModel`. */
  models: string[];
};

/** Outcome of an OpenRouter test-call (returned as-is to the UI). */
export type OpenRouterTestResult =
  | { ok: true; model: string; latencyMs: number }
  | { ok: false; error: string };

/** Lifecycle snapshot of the local MCP server exposed by the main process. */
export type McpServerStatus = {
  /** `true` when the HTTP server is actually listening. */
  running: boolean;
  /** Exposed endpoint when running, otherwise `null`. */
  url: string | null;
  /** Last start-up error message, otherwise `null`. */
  error: string | null;
};

/** Typology of a single tool input parameter, sufficient to render a form. */
export type McpToolParamInfo = {
  name: string;
  description: string;
  kind: "string" | "number" | "boolean" | "json";
  optional: boolean;
};

/** Static metadata for a tool registered on the local MCP server. */
export type McpToolInfo = {
  name: string;
  title: string;
  description: string;
  group: "template" | "skill" | "run";
  parameters: ReadonlyArray<McpToolParamInfo>;
};

/** Outcome of an in-app tool invocation (bypasses the HTTP transport). */
export type McpInvokeResult =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; error: string; durationMs: number };

/**
 * Payload du base prompt système du chat. `value` = chaîne éditée par
 * l'utilisateur, `null` si jamais personnalisé ; `defaultValue` = préambule
 * par défaut (pour le bouton Réinitialiser) ; `toolsSection` = liste des
 * tools `ctxfirst_*` auto-ajoutée au prompt effectif, exposée en lecture seule
 * pour preview dans le modal.
 */
export type ChatSystemPrompt = {
  value: string | null;
  defaultValue: string;
  toolsSection: string;
  /** Cap dur côté store (en caractères). Au-delà : troncature silencieuse. */
  maxChars: number;
};

export interface SettingsGateway {
  getLinearApiKeyStatus(): Promise<LinearApiKeyStatus>;
  setLinearApiKey(key: string): Promise<LinearApiKeyStatus>;
  clearLinearApiKey(): Promise<LinearApiKeyStatus>;

  // GitLab access token (consumed by the `git.clone` step). The plaintext
  // token never crosses on read — only `{ hasToken, lastFour }`.
  getGitLabTokenStatus(): Promise<GitLabTokenStatus>;
  setGitLabAccessToken(token: string): Promise<GitLabTokenStatus>;
  clearGitLabAccessToken(): Promise<GitLabTokenStatus>;

  /**
   * Efface intégralement les réglages utilisateur persistés côté main. Ne
   * touche pas aux préférences renderer (localStorage) — c'est la
   * responsabilité de l'appelant.
   */
  clearAllSettings(): Promise<void>;

  /**
   * Réinitialisation d'usine : efface tous les réglages user *et* vide la base
   * (toutes les tables) + les données générées sur disque, puis tue l'app
   * (sans la relancer — l'utilisateur la rouvrira). La promesse ne résout
   * jamais — le process est tué côté main.
   */
  factoryReset(): Promise<void>;

  // OpenRouter
  getOpenRouterStatus(): Promise<OpenRouterStatus>;
  setOpenRouterApiKey(key: string): Promise<OpenRouterStatus>;
  clearOpenRouterApiKey(): Promise<OpenRouterStatus>;
  setOpenRouterDefaultModel(model: string): Promise<OpenRouterStatus>;
  setOpenRouterModels(models: ReadonlyArray<string>): Promise<OpenRouterStatus>;
  testOpenRouterConnection(): Promise<OpenRouterTestResult>;

  // MCP server
  getMcpServerStatus(): Promise<McpServerStatus>;
  listMcpTools(): Promise<ReadonlyArray<McpToolInfo>>;
  invokeMcpTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpInvokeResult>;

  // Chat system prompt (global default applied to new conversations only).
  getChatSystemPrompt(): Promise<ChatSystemPrompt>;
  setChatSystemPrompt(value: string): Promise<ChatSystemPrompt>;
}
