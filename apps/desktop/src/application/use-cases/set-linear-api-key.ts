import type { SettingsGateway } from "../ports/settings-gateway";

export const makeSetLinearApiKey =
  (gateway: SettingsGateway) => gateway.setLinearApiKey.bind(gateway);

export type SetLinearApiKey = ReturnType<typeof makeSetLinearApiKey>;
