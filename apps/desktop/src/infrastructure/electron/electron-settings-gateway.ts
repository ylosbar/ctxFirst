import type { SettingsGateway } from "../../application/ports/settings-gateway";

export const createElectronSettingsGateway = (): SettingsGateway => ({
  getLinearApiKeyStatus() {
    return window.api.settings.getLinearApiKeyStatus();
  },
  setLinearApiKey(key) {
    return window.api.settings.setLinearApiKey(key);
  },
  clearLinearApiKey() {
    return window.api.settings.clearLinearApiKey();
  },

  getGitLabTokenStatus() {
    return window.api.settings.gitlab.getStatus();
  },
  setGitLabAccessToken(token) {
    return window.api.settings.gitlab.setAccessToken(token);
  },
  clearGitLabAccessToken() {
    return window.api.settings.gitlab.clearAccessToken();
  },

  clearAllSettings() {
    return window.api.settings.clearAll();
  },
  factoryReset() {
    return window.api.settings.factoryReset();
  },

  getOpenRouterStatus() {
    return window.api.settings.openrouter.getStatus();
  },
  setOpenRouterApiKey(key) {
    return window.api.settings.openrouter.setApiKey(key);
  },
  clearOpenRouterApiKey() {
    return window.api.settings.openrouter.clearApiKey();
  },
  setOpenRouterDefaultModel(model) {
    return window.api.settings.openrouter.setDefaultModel(model);
  },
  setOpenRouterModels(models) {
    return window.api.settings.openrouter.setModels(models);
  },
  testOpenRouterConnection() {
    return window.api.settings.openrouter.testConnection();
  },

  getMcpServerStatus() {
    return window.api.mcp.getStatus();
  },
  listMcpTools() {
    return window.api.mcp.listTools();
  },
  invokeMcpTool(name, args) {
    return window.api.mcp.invokeTool(name, args);
  },

  getChatSystemPrompt() {
    return window.api.settings.chat.getSystemPrompt();
  },
  setChatSystemPrompt(value) {
    return window.api.settings.chat.setSystemPrompt(value);
  },
});
