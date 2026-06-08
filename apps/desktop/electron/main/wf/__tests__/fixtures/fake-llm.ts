import type {
  ClaudeCodeInvokeRequest,
  ClaudeCodeInvokeResult,
  LLMGateway,
} from "../../application/ports/outbound/llm-gateway";
import type { LlmSessionPayload } from "../../application/ports/outbound/event-bus";

/**
 * Scripted response handed back by `enqueueResponse`. The fake replays
 * `output` chunk-by-chunk through `onEvent` and returns the full text.
 */
export type ScriptedLlmResponse = {
  output: string;
  /** Per-event side-effects to emit before returning. */
  sessionEvents?: ReadonlyArray<LlmSessionPayload>;
  /** Override telemetry. Defaults: tokensIn/Out = lengths / 4, latency 1ms. */
  tokensIn?: number;
  tokensOut?: number;
  /** Cache tokens to report back — default `undefined` (no caching). */
  cacheCreate?: number;
  cacheRead?: number;
  latencyMs?: number;
  costUsd?: number;
  /** Override provider tag — defaults to `"fake"`. */
  provider?: string;
};

export type FakeLLMGateway = LLMGateway & {
  /** Push a scripted response. The N-th `invokeStreaming` call pops the N-th one. */
  enqueueResponse(resp: ScriptedLlmResponse | string): void;
  /** Convenience: push one trivial Markdown response. */
  enqueueText(text: string): void;
  /** All requests received, in order. */
  readonly invocations: ReadonlyArray<ClaudeCodeInvokeRequest>;
  reset(): void;
};

export const createFakeLLMGateway = (): FakeLLMGateway => {
  const queue: ScriptedLlmResponse[] = [];
  const invocations: ClaudeCodeInvokeRequest[] = [];

  return {
    async invokeStreaming(req): Promise<ClaudeCodeInvokeResult> {
      invocations.push(req);
      const next = queue.shift();
      if (!next) {
        throw new Error(
          `[fake-llm] no scripted response left for invocation #${invocations.length}`,
        );
      }
      if (req.onEvent && next.sessionEvents) {
        for (const evt of next.sessionEvents) req.onEvent(evt);
      }
      return {
        output: next.output,
        tokensIn:
          next.tokensIn ??
          Math.ceil((req.systemPrompt.length + req.userPrompt.length) / 4),
        tokensOut: next.tokensOut ?? Math.ceil(next.output.length / 4),
        cacheCreate: next.cacheCreate,
        cacheRead: next.cacheRead,
        latencyMs: next.latencyMs ?? 1,
        costUsd: next.costUsd ?? 0,
        provider: next.provider ?? "fake",
      };
    },
    enqueueResponse(resp) {
      queue.push(typeof resp === "string" ? { output: resp } : resp);
    },
    enqueueText(text) {
      queue.push({ output: text });
    },
    get invocations() {
      return invocations;
    },
    reset() {
      queue.length = 0;
      invocations.length = 0;
    },
  };
};
