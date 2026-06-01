import type { PluginGateway } from "../ports/plugin-gateway";

export type InvokePluginInput = {
  readonly pluginId: string;
  readonly method: string;
  readonly args?: unknown;
};

export const makeInvokePlugin =
  (gateway: PluginGateway) =>
  ({ pluginId, method, args }: InvokePluginInput): Promise<unknown> =>
    gateway.invoke(pluginId, method, args);

export type InvokePlugin = ReturnType<typeof makeInvokePlugin>;
