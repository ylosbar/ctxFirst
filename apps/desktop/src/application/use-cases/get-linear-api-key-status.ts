import type { SettingsGateway } from "../ports/settings-gateway";

export const makeGetLinearApiKeyStatus =
  (gateway: SettingsGateway) => gateway.getLinearApiKeyStatus.bind(gateway);

export type GetLinearApiKeyStatus = ReturnType<typeof makeGetLinearApiKeyStatus>;
