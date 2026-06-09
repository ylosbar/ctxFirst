import { describe, expect, it } from "vitest";
import { buildTokenStats } from "./build-token-stats";
import type { StepTokenUsage } from "@shared/wf/token-usage";
import type { InstanceView, StepExecutionView } from "../../../domain/workflow/types";

const T0 = 1_000_000;

const exec = (id: string, stepId: string, endedAt: string): StepExecutionView =>
  ({ id, stepId, executionEndedAt: endedAt }) as unknown as StepExecutionView;

const usage = (over: Partial<StepTokenUsage> & { stepExecId: string }): StepTokenUsage => ({
  tokensIn: 0,
  tokensOut: 0,
  cacheCreate: 0,
  cacheRead: 0,
  runCount: 1,
  ...over,
});

const instanceOf = (execs: StepExecutionView[]): InstanceView =>
  ({ executions: execs }) as unknown as InstanceView;

describe("buildTokenStats — cache tokens", () => {
  it("accumulates cache into cumulative totals and the grand total", () => {
    const execs = [
      exec("e1", "s1", new Date(T0 + 1000).toISOString()),
      exec("e2", "s2", new Date(T0 + 2000).toISOString()),
    ];
    const model = buildTokenStats({
      instance: instanceOf(execs),
      template: null,
      usage: [
        usage({ stepExecId: "e1", tokensIn: 10, tokensOut: 5, cacheCreate: 100, cacheRead: 900 }),
        usage({ stepExecId: "e2", tokensIn: 4, tokensOut: 6, cacheCreate: 0, cacheRead: 50 }),
      ],
      t0Ms: T0,
      tEndMs: T0 + 3000,
    });

    expect(model.totalIn).toBe(14);
    expect(model.totalOut).toBe(11);
    expect(model.totalCacheCreate).toBe(100);
    expect(model.totalCacheRead).toBe(950);
    // Real total = in + out + cacheCreate + cacheRead.
    expect(model.totalTokens).toBe(14 + 11 + 100 + 950);

    const [p1, p2] = model.points;
    expect(p1).toMatchObject({
      cacheCreate: 100,
      cacheRead: 900,
      cumCacheCreate: 100,
      cumCacheRead: 900,
      total: 10 + 5 + 100 + 900,
      cumTotal: 10 + 5 + 100 + 900,
    });
    expect(p2).toMatchObject({
      cumCacheCreate: 100,
      cumCacheRead: 950,
      cumTotal: 14 + 11 + 100 + 950,
    });
  });
});
