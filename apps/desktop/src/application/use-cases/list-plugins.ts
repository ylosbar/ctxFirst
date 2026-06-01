import type { PluginGateway } from "../ports/plugin-gateway";
import type { PluginListEntry } from "../../domain/plugin/types";

export const makeListPlugins =
  (gateway: PluginGateway) =>
  (): Promise<ReadonlyArray<PluginListEntry>> =>
    gateway.list();

export type ListPlugins = ReturnType<typeof makeListPlugins>;
