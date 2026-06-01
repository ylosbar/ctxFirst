import type { PluginGateway } from "../ports/plugin-gateway";
import type {
  PluginListEntry,
  PluginSetEnabledInput,
} from "../../domain/plugin/types";

export const makeSetPluginEnabled =
  (gateway: PluginGateway) =>
  (input: PluginSetEnabledInput): Promise<PluginListEntry | null> =>
    gateway.setEnabled(input);

export type SetPluginEnabled = ReturnType<typeof makeSetPluginEnabled>;
