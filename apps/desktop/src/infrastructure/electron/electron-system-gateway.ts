import type { SystemGateway } from "../../application/ports/system-gateway";

export const createElectronSystemGateway = (): SystemGateway => ({
  async pickDirectory(args) {
    return window.api.system.pickDirectory(args);
  },
  async pickFile(args) {
    return window.api.system.pickFile(args);
  },
  async pickAndReadTextFile(args) {
    return window.api.system.pickAndReadTextFile(args);
  },
  async saveTextFile(args) {
    return window.api.system.saveTextFile(args);
  },
  async openExternal(url) {
    await window.api.openExternal(url);
  },
  window: {
    minimize: () => window.api.system.window.minimize(),
    maximizeToggle: () => window.api.system.window.maximizeToggle(),
    close: () => window.api.system.window.close(),
    isMaximized: () => window.api.system.window.isMaximized(),
    onMaximizedChange: (listener) =>
      window.api.system.window.onMaximizedChange(listener),
  },
});
