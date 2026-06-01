import type { PluginGateway } from "../ports/plugin-gateway";
import type {
  PluginGrantInput,
  PluginListEntry,
} from "../../domain/plugin/types";

export const makeGrantPlugin =
  (gateway: PluginGateway) =>
  (input: PluginGrantInput): Promise<PluginListEntry | null> =>
    gateway.grant(input);

export type GrantPlugin = ReturnType<typeof makeGrantPlugin>;
