import type { ClockPort } from "../../application/ports/outbound/clock";

export const createSystemClock = (): ClockPort => ({
  now: () => new Date().toISOString(),
});
