import type { SettingsGateway } from "../ports/settings-gateway";

export const makeGetGitLabTokenStatus =
  (gateway: SettingsGateway) => gateway.getGitLabTokenStatus.bind(gateway);

export type GetGitLabTokenStatus = ReturnType<typeof makeGetGitLabTokenStatus>;
