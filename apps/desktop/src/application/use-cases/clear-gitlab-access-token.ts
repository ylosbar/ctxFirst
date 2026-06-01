import type { SettingsGateway } from "../ports/settings-gateway";

export const makeClearGitLabAccessToken =
  (gateway: SettingsGateway) => gateway.clearGitLabAccessToken.bind(gateway);

export type ClearGitLabAccessToken = ReturnType<
  typeof makeClearGitLabAccessToken
>;
