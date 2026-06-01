import type { SystemGateway } from "../ports/system-gateway";

export type PickDirectoryInput = { defaultPath?: string; title?: string };

export const makePickDirectory =
  (gateway: SystemGateway) =>
  (input?: PickDirectoryInput): Promise<string | null> =>
    gateway.pickDirectory(input);

export type PickDirectory = ReturnType<typeof makePickDirectory>;
