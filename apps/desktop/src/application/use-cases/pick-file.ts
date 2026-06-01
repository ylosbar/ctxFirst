import type { SystemGateway } from "../ports/system-gateway";

export type PickFileInput = {
  defaultPath?: string;
  title?: string;
  filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
};

export const makePickFile =
  (gateway: SystemGateway) =>
  (input?: PickFileInput): Promise<string | null> =>
    gateway.pickFile(input);

export type PickFile = ReturnType<typeof makePickFile>;
