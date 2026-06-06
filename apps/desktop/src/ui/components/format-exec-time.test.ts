import { describe, expect, it } from "vitest";
import { formatExecDuration } from "./format-exec-time";

describe("formatExecDuration", () => {
  it("uses executionEndedAt over a later endedAt (human wait excluded)", () => {
    // 2s of compute, then a 10min human wait before the terminal endedAt.
    const duration = formatExecDuration({
      startedAt: "2026-06-06T10:00:00.000Z",
      executionEndedAt: "2026-06-06T10:00:02.000Z",
      endedAt: "2026-06-06T10:10:00.000Z",
    });
    expect(duration).toBe("2s");
  });

  it("falls back to endedAt when executionEndedAt is absent", () => {
    const duration = formatExecDuration({
      startedAt: "2026-06-06T10:00:00.000Z",
      endedAt: "2026-06-06T10:00:05.000Z",
    });
    expect(duration).toBe("5s");
  });

  it("returns null when the step is still running (no end timestamp)", () => {
    const duration = formatExecDuration({
      startedAt: "2026-06-06T10:00:00.000Z",
    });
    expect(duration).toBeNull();
  });

  it("returns null for a negative span (end before start)", () => {
    const duration = formatExecDuration({
      startedAt: "2026-06-06T10:00:05.000Z",
      executionEndedAt: "2026-06-06T10:00:00.000Z",
    });
    expect(duration).toBeNull();
  });

  it("returns null for invalid dates", () => {
    const duration = formatExecDuration({
      startedAt: "not-a-date",
      executionEndedAt: "2026-06-06T10:00:05.000Z",
    });
    expect(duration).toBeNull();
  });
});
