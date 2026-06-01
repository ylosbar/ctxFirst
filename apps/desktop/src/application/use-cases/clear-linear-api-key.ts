import type { SettingsGateway } from "../ports/settings-gateway";

export const makeClearLinearApiKey =
  (gateway: SettingsGateway) => gateway.clearLinearApiKey.bind(gateway);

export type ClearLinearApiKey = ReturnType<typeof makeClearLinearApiKey>;
