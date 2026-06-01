import { ipcMain } from "electron";
import {
  MAX_CHAT_SYSTEM_PROMPT_CHARS,
  type SettingsStore,
} from "../settings/store";
import { createOpenRouterClient } from "../wf/adapters/llm/openrouter";
import {
  CHAT_TOOLS_SECTION,
  DEFAULT_CHAT_BASE_PROMPT,
} from "../chat/system-prompt";

export const registerSettingsHandlers = (settings: SettingsStore) => {
  ipcMain.handle("settings:getLinearApiKeyStatus", async () => {
    return settings.getLinearApiKeyStatus();
  });

  ipcMain.handle(
    "settings:setLinearApiKey",
    async (_e, args: { key: string }) => {
      settings.setLinearApiKey(args.key);
      return settings.getLinearApiKeyStatus();
    },
  );

  ipcMain.handle("settings:clearLinearApiKey", async () => {
    settings.clearLinearApiKey();
    return settings.getLinearApiKeyStatus();
  });

  // --- GitLab access token (consumed by the `git.clone` step runner) ---
  ipcMain.handle("settings:gitlab:getStatus", async () =>
    settings.getGitLabTokenStatus(),
  );

  ipcMain.handle(
    "settings:gitlab:setAccessToken",
    async (_e, args: { token: string }) => {
      settings.setGitLabAccessToken(args.token);
      return settings.getGitLabTokenStatus();
    },
  );

  ipcMain.handle("settings:gitlab:clearAccessToken", async () => {
    settings.clearGitLabAccessToken();
    return settings.getGitLabTokenStatus();
  });

  // Efface intégralement les réglages utilisateur (table app_settings).
  // Les préférences purement renderer (thème/langue/densité dans
  // localStorage) sont effacées côté UI avant le reload.
  ipcMain.handle("settings:clearAll", async () => {
    settings.clearAll();
  });

  // --- OpenRouter ---
  ipcMain.handle("settings:openrouter:getStatus", async () => {
    return settings.getOpenRouterStatus();
  });

  ipcMain.handle(
    "settings:openrouter:setApiKey",
    async (_e, args: { key: string }) => {
      settings.setOpenRouterApiKey(args.key);
      return settings.getOpenRouterStatus();
    },
  );

  ipcMain.handle("settings:openrouter:clearApiKey", async () => {
    settings.clearOpenRouterApiKey();
    return settings.getOpenRouterStatus();
  });

  ipcMain.handle(
    "settings:openrouter:setDefaultModel",
    async (_e, args: { model: string }) => {
      settings.setOpenRouterDefaultModel(args.model);
      return settings.getOpenRouterStatus();
    },
  );

  ipcMain.handle(
    "settings:openrouter:setModels",
    async (_e, args: { models: ReadonlyArray<string> }) => {
      settings.setOpenRouterModels(args.models);
      // If the current default was removed from the list, fall back to the
      // first remaining entry so the chat selector and step runner never
      // resolve to a model that isn't in the curated list.
      const status = settings.getOpenRouterStatus();
      if (!status.models.includes(status.defaultModel) && status.models[0]) {
        settings.setOpenRouterDefaultModel(status.models[0]);
      }
      return settings.getOpenRouterStatus();
    },
  );

  // --- Chat (base system prompt édité depuis la chatbox) ---
  // La section "tools" est codée en dur côté main et toujours concaténée par
  // `systemPromptForContext` ; on l'expose en lecture seule au renderer
  // pour qu'il puisse afficher le prompt effectif complet sans dupliquer la
  // constante côté UI.
  ipcMain.handle("settings:chat:getSystemPrompt", async () => ({
    value: settings.getChatSystemPrompt(),
    defaultValue: DEFAULT_CHAT_BASE_PROMPT,
    toolsSection: CHAT_TOOLS_SECTION,
    maxChars: MAX_CHAT_SYSTEM_PROMPT_CHARS,
  }));

  ipcMain.handle(
    "settings:chat:setSystemPrompt",
    async (_e, args: { value: string }) => {
      settings.setChatSystemPrompt(args.value);
      return {
        value: settings.getChatSystemPrompt(),
        defaultValue: DEFAULT_CHAT_BASE_PROMPT,
        toolsSection: CHAT_TOOLS_SECTION,
        maxChars: MAX_CHAT_SYSTEM_PROMPT_CHARS,
      };
    },
  );

  ipcMain.handle("settings:openrouter:testConnection", async () => {
    const client = createOpenRouterClient({
      getApiKey: async () => settings.getOpenRouterApiKey(),
    });
    try {
      const res = await client.complete({
        model: settings.getOpenRouterDefaultModel(),
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 8,
      });
      return { ok: true as const, model: res.modelUsed, latencyMs: res.latencyMs };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  console.log("[settings:ipc] handlers registered");
};
