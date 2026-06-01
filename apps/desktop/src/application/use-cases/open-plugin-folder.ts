import type { PluginGateway } from "../ports/plugin-gateway";

export const makeOpenPluginFolder =
  (gateway: PluginGateway) =>
  (input?: { pluginId?: string }): Promise<void> =>
    gateway.openFolder(input);

export type OpenPluginFolder = ReturnType<typeof makeOpenPluginFolder>;
