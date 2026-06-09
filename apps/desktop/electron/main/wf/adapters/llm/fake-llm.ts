import type {
  LLMGateway,
  ClaudeCodeInvokeRequest,
  ClaudeCodeInvokeResult,
} from "../../application/ports/outbound/llm-gateway";

type Deps = {
  respond: (req: ClaudeCodeInvokeRequest) => string;
  chunkSize?: number;
};

export const createFakeLLMGateway = ({ respond, chunkSize = 40 }: Deps): LLMGateway => ({
  async invokeStreaming(req: ClaudeCodeInvokeRequest): Promise<ClaudeCodeInvokeResult> {
    const started = Date.now();
    const full = respond(req);
    if (req.onEvent) {
      req.onEvent({ type: "session-start", model: req.model });
      for (let i = 0; i < full.length; i += chunkSize) {
        req.onEvent({ type: "text-delta", text: full.slice(i, i + chunkSize) });
      }
      req.onEvent({ type: "assistant-message-end" });
    }
    const tokensIn = Math.ceil((req.systemPrompt.length + req.userPrompt.length) / 4);
    const tokensOut = Math.ceil(full.length / 4);
    const latencyMs = Date.now() - started;
    if (req.onEvent) {
      req.onEvent({
        type: "result",
        tokensIn,
        tokensOut,
        costUsd: 0,
        latencyMs,
      });
    }
    return {
      output: full,
      tokensIn,
      tokensOut,
      cacheCreate: undefined,
      cacheRead: undefined,
      latencyMs,
      costUsd: 0,
      provider: "fake",
    };
  },
});
