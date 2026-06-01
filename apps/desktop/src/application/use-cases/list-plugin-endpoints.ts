import type { PluginGateway } from "../ports/plugin-gateway";

/**
 * Wrapper around `pluginGateway.invoke(pluginId, "list-endpoints")` used by
 * config components that need to enumerate the endpoints contributed by a
 * plugin. Keeps React components free of any direct
 * `window.api.plugins.invoke` reference.
 *
 * The payload is typed `unknown` here — runtime validation is the
 * responsibility of the caller (the plugin's response shape is plugin-specific
 * and cannot be guaranteed at the port level).
 */
export const makeListPluginEndpoints =
  (gateway: PluginGateway) =>
  (pluginId: string): Promise<unknown> =>
    gateway.invoke(pluginId, "list-endpoints");

export type ListPluginEndpoints = ReturnType<typeof makeListPluginEndpoints>;
