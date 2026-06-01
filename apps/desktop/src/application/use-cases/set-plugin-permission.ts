import type { PluginGateway } from "../ports/plugin-gateway";
import type {
  PluginListEntry,
  PluginSetPermissionInput,
} from "../../domain/plugin/types";

export const makeSetPluginPermission =
  (gateway: PluginGateway) =>
  (input: PluginSetPermissionInput): Promise<PluginListEntry | null> =>
    gateway.setPermission(input);

export type SetPluginPermission = ReturnType<typeof makeSetPluginPermission>;
