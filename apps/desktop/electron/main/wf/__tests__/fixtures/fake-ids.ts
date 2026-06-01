import type { IdGenerator } from "../../application/ports/outbound/id-generator";

export type FakeIdGenerator = IdGenerator & {
  /** Next id that will be returned, useful for assertions. */
  peek(): string;
  /** Counter — number of ids already issued. */
  readonly count: number;
  reset(): void;
};

/**
 * Deterministic id generator: returns `${prefix}-1`, `${prefix}-2`, …
 * Default prefix is `"id"`.
 */
export const createFakeIdGenerator = (prefix = "id"): FakeIdGenerator => {
  let n = 0;
  return {
    newId() {
      n += 1;
      return `${prefix}-${n}`;
    },
    peek() {
      return `${prefix}-${n + 1}`;
    },
    get count() {
      return n;
    },
    reset() {
      n = 0;
    },
  };
};
