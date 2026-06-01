import type { EnvironmentPort } from "../../application/ports/outbound/environment";

export type FakeEnvironment = EnvironmentPort & {
  set(key: string, value: string | undefined): void;
  readonly reads: ReadonlyArray<ReadonlyArray<string>>;
  reset(): void;
};

export const createFakeEnvironment = (
  initial: Record<string, string> = {},
): FakeEnvironment => {
  const env = new Map<string, string>(Object.entries(initial));
  const reads: ReadonlyArray<string>[] = [];

  return {
    read(keys) {
      reads.push(keys.slice());
      const out: Record<string, string> = {};
      for (const k of keys) {
        const v = env.get(k);
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
    set(key, value) {
      if (value === undefined) env.delete(key);
      else env.set(key, value);
    },
    get reads() {
      return reads;
    },
    reset() {
      env.clear();
      reads.length = 0;
    },
  };
};
