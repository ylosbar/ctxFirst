import type { ParserRegistry } from "../ports/outbound/parser-registry";
import type { SaveUserParser } from "../../domain/parser";

type Deps = { parsers: ParserRegistry };

export type SaveParser = (parser: SaveUserParser) => Promise<void>;

export const makeSaveParser =
  ({ parsers }: Deps): SaveParser =>
  async (parser) => {
    const id = String(parser.id ?? "").trim();
    const version = String(parser.version ?? "").trim();
    if (!id) throw new Error("parser id is required");
    if (!version) throw new Error("parser version is required");
    if (!parser.forType?.id || !parser.forType?.version) {
      throw new Error("parser.forType requires id and version");
    }
    if (parser.mode !== "declarative" && parser.mode !== "code") {
      throw new Error(`parser mode must be "declarative" or "code"`);
    }
    if (parser.body === undefined) {
      throw new Error("parser body is required");
    }
    await parsers.save({ ...parser, id, version });
  };
