import type { ClockPort } from "../../application/ports/outbound/clock";

export type FakeClock = ClockPort & {
  /** Advance the clock by `ms` and return the new ISO. */
  tick(ms?: number): string;
  /** Force the next `now()` to return this ISO (and subsequent ticks anchor here). */
  setNow(iso: string): void;
  reset(): void;
};

const DEFAULT_START_ISO = "2026-01-01T00:00:00.000Z";

export const createFakeClock = (startIso: string = DEFAULT_START_ISO): FakeClock => {
  let current = Date.parse(startIso);

  const isoOf = () => new Date(current).toISOString();

  return {
    now() {
      const value = isoOf();
      current += 1;
      return value;
    },
    tick(ms = 1000) {
      current += ms;
      return isoOf();
    },
    setNow(iso) {
      current = Date.parse(iso);
    },
    reset() {
      current = Date.parse(startIso);
    },
  };
};
