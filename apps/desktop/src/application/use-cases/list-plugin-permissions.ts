import type { PluginGateway } from "../ports/plugin-gateway";
import type { PluginPermissionMeta } from "../../domain/plugin/types";

export const makeListPluginPermissions =
  (gateway: PluginGateway) =>
  (): Promise<ReadonlyArray<PluginPermissionMeta>> =>
    gateway.listPermissions();

export type ListPluginPermissions = ReturnType<typeof makeListPluginPermissions>;
