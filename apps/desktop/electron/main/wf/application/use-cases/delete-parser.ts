import type { ParserRegistry } from "../ports/outbound/parser-registry";
import type { ParserRef } from "../../domain/parser";

type Deps = { parsers: ParserRegistry };

export type DeleteParser = (ref: ParserRef) => Promise<void>;

export const makeDeleteParser =
  ({ parsers }: Deps): DeleteParser =>
  async (ref) => {
    const id = String(ref?.id ?? "").trim();
    const version = String(ref?.version ?? "").trim();
    if (!id || !version) {
      throw new Error("parser ref requires id and version");
    }
    await parsers.remove({ id, version });
  };
