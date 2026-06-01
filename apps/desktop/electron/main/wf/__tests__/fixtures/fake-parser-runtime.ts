import type { ParserRuntime } from "../../application/ports/outbound/parser-runtime";
import type { ParserRecord, ParserRef } from "../../domain/parser";

type Mapping = (raw: unknown) => unknown;

const refKey = (ref: ParserRef): string => `${ref.id}@${ref.version}`;

export type FakeParserRuntime = ParserRuntime & {
  /** Register a mapping for a specific parser ref. */
  setMapping(ref: ParserRef, fn: Mapping): void;
  /** Make `run` throw the given error for a specific parser ref. */
  setError(ref: ParserRef, error: Error): void;
  readonly invocations: ReadonlyArray<{ parser: ParserRecord; raw: unknown }>;
  reset(): void;
};

export const createFakeParserRuntime = (): FakeParserRuntime => {
  const mappings = new Map<string, Mapping>();
  const errors = new Map<string, Error>();
  const invocations: { parser: ParserRecord; raw: unknown }[] = [];

  return {
    async run(parser, raw) {
      invocations.push({ parser, raw });
      const key = refKey({ id: parser.id, version: parser.version });
      const err = errors.get(key);
      if (err) throw err;
      const fn = mappings.get(key);
      if (!fn) return raw; // passthrough by default
      return fn(raw);
    },
    setMapping(ref, fn) {
      mappings.set(refKey(ref), fn);
    },
    setError(ref, error) {
      errors.set(refKey(ref), error);
    },
    get invocations() {
      return invocations;
    },
    reset() {
      mappings.clear();
      errors.clear();
      invocations.length = 0;
    },
  };
};
