import type { SettingsGateway } from "../ports/settings-gateway";

export const makeSetGitLabAccessToken =
  (gateway: SettingsGateway) => gateway.setGitLabAccessToken.bind(gateway);

export type SetGitLabAccessToken = ReturnType<typeof makeSetGitLabAccessToken>;
