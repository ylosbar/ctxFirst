import type { ParserRegistry } from "../ports/outbound/parser-registry";
import type { ParserRuntime } from "../ports/outbound/parser-runtime";
import type { ArtifactSchemaRef } from "../../domain/artifact-schema";
import type { ParserMode, ParserRecord, ParserRef } from "../../domain/parser";

type Deps = { parsers: ParserRegistry; parserRuntime: ParserRuntime };

/**
 * Playground entry point: runs a parser against a raw payload and returns the
 * simplified result. Supports two variants — running a *saved* parser by ref
 * (typical "preview the active parser") and running an *inline* body that
 * isn't persisted yet (the editor's live preview). The latter is the reason
 * we don't reuse the registry for inline runs: the user hasn't committed.
 *
 * Errors from the runtime are surfaced as-is so the renderer can show the
 * faulty operation index (cf. `ParserExecutionError.opIndex`).
 */
export type RunParserInput =
  | { kind: "saved"; ref: ParserRef; raw: unknown }
  | {
      kind: "inline";
      forType: ArtifactSchemaRef;
      mode: ParserMode;
      body: unknown;
      raw: unknown;
    };

export type RunParserResult = { ok: true; simplified: unknown };

export type RunParser = (input: RunParserInput) => Promise<RunParserResult>;

export const makeRunParser =
  ({ parsers, parserRuntime }: Deps): RunParser =>
  async (input) => {
    let record: ParserRecord;
    if (input.kind === "saved") {
      const r = parsers.resolve(input.ref);
      if (!r) {
        throw new Error(
          `unknown parser ${input.ref.id}@${input.ref.version}`,
        );
      }
      record = r;
    } else {
      record = {
        id: "__playground__",
        version: "v0",
        forType: input.forType,
        mode: input.mode,
        body: input.body,
        source: { kind: "user" },
        meta: {},
      };
    }
    const simplified = await parserRuntime.run(record, input.raw);
    return { ok: true, simplified };
  };
