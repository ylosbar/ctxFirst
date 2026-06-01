/**
 * Composite {@link ParserRuntime} that dispatches by `parser.mode`. Lets the
 * application layer treat the two implementations (declarative interpreter,
 * QuickJS sandbox) as one runtime. The orchestrator / `ContextAssembler` /
 * `run-parser` use-case do not need to know which backend handles which mode.
 */
import type { ParserRuntime } from "../../application/ports/outbound/parser-runtime";
import type { ParserMode, ParserRecord } from "../../domain/parser";

type Backends = Partial<Record<ParserMode, ParserRuntime>>;

export const createDispatchingParserRuntime = (
  backends: Backends,
): ParserRuntime => ({
  async run(parser: ParserRecord, raw: unknown): Promise<unknown> {
    const backend = backends[parser.mode];
    if (!backend) {
      throw new Error(
        `no parser runtime registered for mode "${parser.mode}" (parser ${parser.id}@${parser.version})`,
      );
    }
    return backend.run(parser, raw);
  },
});
