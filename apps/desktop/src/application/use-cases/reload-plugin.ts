import type { PluginGateway } from "../ports/plugin-gateway";
import type { PluginListEntry } from "../../domain/plugin/types";

export const makeReloadPlugin =
  (gateway: PluginGateway) =>
  (input: { pluginId: string }): Promise<PluginListEntry | null> =>
    gateway.reload(input);

export type ReloadPlugin = ReturnType<typeof makeReloadPlugin>;
