import type { SystemGateway } from "../ports/system-gateway";

export type SaveTextFileInput = {
  content: string;
  defaultFileName?: string;
  title?: string;
  filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
};

export const makeSaveTextFile =
  (gateway: SystemGateway) =>
  (input: SaveTextFileInput): Promise<string | null> =>
    gateway.saveTextFile(input);

export type SaveTextFile = ReturnType<typeof makeSaveTextFile>;
