import type { SystemGateway } from "../ports/system-gateway";

export const makeOpenExternalUrl =
  (gateway: SystemGateway) =>
  (url: string): Promise<void> =>
    gateway.openExternal(url);

export type OpenExternalUrl = ReturnType<typeof makeOpenExternalUrl>;
