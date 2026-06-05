/**
 * App-level settings store. Persists user-configurable values (API keys,
 * preferences) in the `app_settings` SQLite table, with secrets encrypted
 * via Electron's `safeStorage` (OS keychain / keyring under the hood).
 *
 * `safeStorage` requires `app.whenReady()`; this module must be instantiated
 * after the Electron app is ready.
 */
import { safeStorage } from "electron";
import type Database from "better-sqlite3";

const KEY_LINEAR_API_KEY = "linear.apiKey";
const KEY_GITLAB_ACCESS_TOKEN = "gitlab.accessToken";
const KEY_ACTIVE_CHANNEL_ID = "ui.activeChannelId";
const KEY_OPENROUTER_API_KEY = "openrouter.apiKey";
const KEY_OPENROUTER_DEFAULT_MODEL = "openrouter.defaultModel";
const KEY_OPENROUTER_MODELS = "openrouter.models";
const KEY_CHAT_SYSTEM_PROMPT = "chat.systemPrompt";
const KEY_DEV_PERF_MONITORING = "dev.perfMonitoring";

export const OPENROUTER_DEFAULT_MODEL_FALLBACK = "openai/gpt-4o-mini";

/**
 * Cap dur sur le base prompt édité par l'utilisateur. Au-delà, on tronque
 * silencieusement à l'écriture (warning console) — l'UI affiche le compteur
 * en rouge mais laisse `Enregistrer` actif.
 */
export const MAX_CHAT_SYSTEM_PROMPT_CHARS = 8192;

export type LinearApiKeyStatus = {
  hasKey: boolean;
  /** Last 4 chars of the key, for UX confirmation. `null` if no key set. */
  lastFour: string | null;
};

export type GitLabTokenStatus = {
  hasToken: boolean;
  /** Last 4 chars of the token, for UX confirmation. `null` if none set. */
  lastFour: string | null;
};

export type OpenRouterStatus = {
  hasApiKey: boolean;
  /** Last 4 chars of the key. `null` if no key set. */
  lastFour: string | null;
  /** Currently configured default model (falls back to the bundled default). */
  defaultModel: string;
  /** User-curated list of model ids picked from openrouter.ai. Always contains `defaultModel`. */
  models: string[];
};

export type SettingsStore = {
  getLinearApiKey: () => string | null;
  setLinearApiKey: (key: string) => void;
  clearLinearApiKey: () => void;
  getLinearApiKeyStatus: () => LinearApiKeyStatus;

  // --- GitLab (consumed by the `git.clone` step runner) ---
  getGitLabAccessToken: () => string | null;
  setGitLabAccessToken: (token: string) => void;
  clearGitLabAccessToken: () => void;
  getGitLabTokenStatus: () => GitLabTokenStatus;

  /** Last channel the user selected. Returns `null` on a clean install. */
  getActiveChannelId: () => string | null;
  setActiveChannelId: (id: string) => void;

  // --- OpenRouter (core since the plugin migration) ---
  getOpenRouterApiKey: () => string | null;
  setOpenRouterApiKey: (key: string) => void;
  clearOpenRouterApiKey: () => void;
  getOpenRouterDefaultModel: () => string;
  setOpenRouterDefaultModel: (model: string) => void;
  getOpenRouterModels: () => string[];
  setOpenRouterModels: (models: ReadonlyArray<string>) => void;
  getOpenRouterStatus: () => OpenRouterStatus;

  // --- Chat (Pi-driven global chat) ---
  /**
   * Base prompt système éditable par l'utilisateur depuis la chatbox. `null`
   * = jamais personnalisé → composer avec `DEFAULT_CHAT_BASE_PROMPT`. Stocké
   * en plaintext (pas un secret).
   */
  getChatSystemPrompt: () => string | null;
  setChatSystemPrompt: (value: string) => void;
  clearChatSystemPrompt: () => void;

  // --- Dev tooling ---
  /**
   * Whether the dev-only Sentry perf monitor (periodic memory gauges) runs.
   * Defaults to `true` — only an explicit opt-out persists. No effect in
   * packaged builds; the monitor is gated on `is.dev` at the call site.
   */
  isDevPerfMonitoringEnabled: () => boolean;
  setDevPerfMonitoringEnabled: (enabled: boolean) => void;

  /**
   * Efface intégralement les réglages utilisateur : vide la table
   * `app_settings` (clés API chiffrées, modèles OpenRouter, canal actif,
   * base prompt…). Remet le profil à l'état d'une installation propre.
   */
  clearAll: () => void;
};

type Deps = {
  db: Database.Database;
};

const encryptToBase64 = (plaintext: string): string => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plaintext).toString("base64");
  }
  // Fallback: store as plaintext but tagged so we know not to decrypt.
  // Linux without an available keyring lands here.
  console.warn(
    "[settings] safeStorage encryption unavailable — storing secret in plaintext.",
  );
  return `plain:${Buffer.from(plaintext, "utf8").toString("base64")}`;
};

const decryptFromBase64 = (stored: string): string | null => {
  if (stored.startsWith("plain:")) {
    return Buffer.from(stored.slice("plain:".length), "base64").toString("utf8");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      "[settings] safeStorage encryption unavailable — cannot decrypt previously stored secret.",
    );
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"));
  } catch (err) {
    console.warn("[settings] failed to decrypt stored secret:", err);
    return null;
  }
};

export const createSettingsStore = ({ db }: Deps): SettingsStore => {
  const readStmt = db.prepare<[string]>(
    "SELECT value FROM app_settings WHERE key = ?",
  );
  const upsertStmt = db.prepare<[string, string, string]>(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const deleteStmt = db.prepare<[string]>(
    "DELETE FROM app_settings WHERE key = ?",
  );
  const deleteAllStmt = db.prepare("DELETE FROM app_settings");

  const readSecret = (key: string): string | null => {
    const row = readStmt.get(key) as { value: string } | undefined;
    if (!row) return null;
    return decryptFromBase64(row.value);
  };

  const writeSecret = (key: string, plaintext: string) => {
    upsertStmt.run(key, encryptToBase64(plaintext), new Date().toISOString());
  };

  const deleteSecret = (key: string) => {
    deleteStmt.run(key);
  };

  const readPlain = (key: string): string | null => {
    const row = readStmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  };
  const writePlain = (key: string, value: string) => {
    upsertStmt.run(key, value, new Date().toISOString());
  };

  return {
    getLinearApiKey() {
      return readSecret(KEY_LINEAR_API_KEY);
    },
    setLinearApiKey(key: string) {
      const trimmed = key.trim();
      if (!trimmed) throw new Error("Linear API key must not be empty");
      writeSecret(KEY_LINEAR_API_KEY, trimmed);
    },
    clearLinearApiKey() {
      deleteSecret(KEY_LINEAR_API_KEY);
    },
    getLinearApiKeyStatus() {
      const key = readSecret(KEY_LINEAR_API_KEY);
      if (!key) return { hasKey: false, lastFour: null };
      return { hasKey: true, lastFour: key.slice(-4) };
    },

    // --- GitLab ---
    getGitLabAccessToken() {
      return readSecret(KEY_GITLAB_ACCESS_TOKEN);
    },
    setGitLabAccessToken(token: string) {
      const trimmed = token.trim();
      if (!trimmed) throw new Error("GitLab access token must not be empty");
      writeSecret(KEY_GITLAB_ACCESS_TOKEN, trimmed);
    },
    clearGitLabAccessToken() {
      deleteSecret(KEY_GITLAB_ACCESS_TOKEN);
    },
    getGitLabTokenStatus() {
      const token = readSecret(KEY_GITLAB_ACCESS_TOKEN);
      if (!token) return { hasToken: false, lastFour: null };
      return { hasToken: true, lastFour: token.slice(-4) };
    },

    getActiveChannelId() {
      return readPlain(KEY_ACTIVE_CHANNEL_ID);
    },
    setActiveChannelId(id: string) {
      writePlain(KEY_ACTIVE_CHANNEL_ID, id);
    },

    // --- OpenRouter ---
    // API key is stored encrypted (safeStorage when available); the default
    // model and model list are plaintext (not secrets, useful for debug).
    getOpenRouterApiKey() {
      return readSecret(KEY_OPENROUTER_API_KEY);
    },
    setOpenRouterApiKey(key: string) {
      const trimmed = key.trim();
      if (!trimmed) throw new Error("OpenRouter API key must not be empty");
      writeSecret(KEY_OPENROUTER_API_KEY, trimmed);
    },
    clearOpenRouterApiKey() {
      deleteSecret(KEY_OPENROUTER_API_KEY);
    },
    getOpenRouterDefaultModel() {
      return readPlain(KEY_OPENROUTER_DEFAULT_MODEL) ?? OPENROUTER_DEFAULT_MODEL_FALLBACK;
    },
    setOpenRouterDefaultModel(model: string) {
      const trimmed = model.trim();
      if (!trimmed) {
        deleteSecret(KEY_OPENROUTER_DEFAULT_MODEL);
        return;
      }
      writePlain(KEY_OPENROUTER_DEFAULT_MODEL, trimmed);
      // Auto-include the picked default in the curated list so the UI never
      // ends up with a default that isn't selectable.
      const current = readModels();
      if (!current.includes(trimmed)) {
        writeModels([...current, trimmed]);
      }
    },
    getOpenRouterModels() {
      return readModels();
    },
    setOpenRouterModels(models) {
      writeModels(models);
    },
    getOpenRouterStatus() {
      const key = readSecret(KEY_OPENROUTER_API_KEY);
      const defaultModel =
        readPlain(KEY_OPENROUTER_DEFAULT_MODEL) ?? OPENROUTER_DEFAULT_MODEL_FALLBACK;
      const models = readModels();
      // Always expose the default in the list even if storage is somehow desync'd.
      const merged = models.includes(defaultModel) ? models : [...models, defaultModel];
      return {
        hasApiKey: !!key,
        lastFour: key ? key.slice(-4) : null,
        defaultModel,
        models: merged,
      };
    },

    // --- Chat ---
    getChatSystemPrompt() {
      return readPlain(KEY_CHAT_SYSTEM_PROMPT);
    },
    setChatSystemPrompt(value: string) {
      const trimmed = value.trim();
      // Empty after trim → revert to default by deleting the row.
      if (!trimmed) {
        deleteSecret(KEY_CHAT_SYSTEM_PROMPT);
        return;
      }
      if (trimmed.length > MAX_CHAT_SYSTEM_PROMPT_CHARS) {
        console.warn(
          `[settings] chat.systemPrompt truncated to ${MAX_CHAT_SYSTEM_PROMPT_CHARS} chars (was ${trimmed.length}).`,
        );
      }
      writePlain(
        KEY_CHAT_SYSTEM_PROMPT,
        trimmed.slice(0, MAX_CHAT_SYSTEM_PROMPT_CHARS),
      );
    },
    clearChatSystemPrompt() {
      deleteSecret(KEY_CHAT_SYSTEM_PROMPT);
    },

    // --- Dev tooling ---
    isDevPerfMonitoringEnabled() {
      // Default on: only a stored "false" opts out.
      return readPlain(KEY_DEV_PERF_MONITORING) !== "false";
    },
    setDevPerfMonitoringEnabled(enabled: boolean) {
      writePlain(KEY_DEV_PERF_MONITORING, enabled ? "true" : "false");
    },

    clearAll() {
      deleteAllStmt.run();
    },
  };

  // ----- helpers scoped to this instance -----

  function readModels(): string[] {
    const raw = readPlain(KEY_OPENROUTER_MODELS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .filter((m): m is string => typeof m === "string")
            .map((m) => m.trim())
            .filter((m) => m.length > 0);
          // Dedupe while preserving order.
          return Array.from(new Set(cleaned));
        }
      } catch (err) {
        console.warn("[settings] could not parse openrouter.models JSON:", err);
      }
    }
    // Bootstrap: derive a single-item list from the legacy defaultModel row.
    const legacy = readPlain(KEY_OPENROUTER_DEFAULT_MODEL);
    return legacy ? [legacy] : [OPENROUTER_DEFAULT_MODEL_FALLBACK];
  }

  function writeModels(models: ReadonlyArray<string>): void {
    const cleaned = Array.from(
      new Set(models.map((m) => m.trim()).filter((m) => m.length > 0)),
    );
    writePlain(KEY_OPENROUTER_MODELS, JSON.stringify(cleaned));
  }
};

/**
 * One-shot migration: the OpenRouter plugin used to store its API key and
 * default model under `plugin-secret:openrouter:<key>` rows (hex-encoded,
 * `safeStorage`-wrapped). The core now owns these credentials directly.
 *
 * Reads any old rows, decrypts them, re-writes under the new core keys, and
 * deletes the originals. Idempotent: a clean install or an already-migrated
 * profile is a silent no-op.
 */
export const migrateOpenRouterPluginSecrets = (
  db: import("better-sqlite3").Database,
  store: SettingsStore,
): void => {
  const OLD_API_KEY_ROW = "plugin-secret:openrouter:api-key";
  const OLD_DEFAULT_MODEL_ROW = "plugin-secret:openrouter:default-model";

  const readRow = db.prepare<[string], { value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
  );
  const deleteRow = db.prepare<[string]>(
    "DELETE FROM app_settings WHERE key = ?",
  );

  // Plugin secrets are hex(safeStorage.encryptString(plaintext)) — see
  // plugins/permissions.ts and plugins/secrets-backend.ts.
  const decryptHexBuffer = (hex: string): string | null => {
    try {
      const buf = Buffer.from(hex, "hex");
      if (!safeStorage.isEncryptionAvailable()) return buf.toString("utf8");
      return safeStorage.decryptString(buf);
    } catch (err) {
      console.warn(
        "[migration:openrouter] failed to decrypt legacy plugin secret:",
        err,
      );
      return null;
    }
  };

  let touched = false;
  const oldApiKey = readRow.get(OLD_API_KEY_ROW);
  if (oldApiKey && !store.getOpenRouterApiKey()) {
    const plaintext = decryptHexBuffer(oldApiKey.value);
    if (plaintext && plaintext.length > 0) {
      store.setOpenRouterApiKey(plaintext);
      touched = true;
    }
  }
  if (oldApiKey) deleteRow.run(OLD_API_KEY_ROW);

  const oldDefaultModel = readRow.get(OLD_DEFAULT_MODEL_ROW);
  if (oldDefaultModel) {
    const plaintext = decryptHexBuffer(oldDefaultModel.value);
    // Only re-write if the user hasn't already picked one in core storage.
    if (plaintext && plaintext.length > 0) {
      const current = readRow.get("openrouter.defaultModel");
      if (!current) {
        store.setOpenRouterDefaultModel(plaintext);
        touched = true;
      }
    }
    deleteRow.run(OLD_DEFAULT_MODEL_ROW);
  }

  if (touched) {
    console.log(
      "[migration:openrouter] credentials migrated from plugin to core",
    );
  }
};
