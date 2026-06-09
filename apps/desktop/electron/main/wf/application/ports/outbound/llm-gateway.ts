/**
 * Port abstracting an LLM provider capable of streaming a completion.
 *
 * The domain does not know whether the LLM is the Anthropic API, the
 * `claude` CLI, a local Ollama or a fake — swap the adapter to swap the
 * backend.
 *
 * Implementations:
 *  - {@link createClaudeCodeLLMGateway} (spawns the `claude` CLI)
 *  - {@link createFakeLLMGateway}       (deterministic fake for tests)
 */

import type { LlmSessionPayload } from "./event-bus";

/** Parameters of a single invocation. */
export type ClaudeCodeInvokeRequest = {
  /** Model identifier (e.g. `"claude-opus-4-7"`). */
  model: string;
  /** System prompt — typically the Skill body. */
  systemPrompt: string;
  /** User prompt — typically the {@link ContextAssembler} output. */
  userPrompt: string;
  /** Upper bound on output tokens. Provider may ignore or clamp. */
  maxTokens?: number;
  /**
   * Working directory the provider must use for native side-effects (e.g.
   * the `cwd` of the spawned Claude CLI). Set per-call so the same gateway
   * instance can serve multiple runs with different workspaces.
   */
  cwd?: string;
  /**
   * Callback invoked for every typed event captured from the provider:
   * session start, text deltas, tool uses/results, thinking, end-of-message,
   * final result. The runner forwards them onto the {@link LlmSessionBus}
   * for the renderer to display the live session.
   */
  onEvent?: (payload: LlmSessionPayload) => void;
  /**
   * Hard upper bound (ms) on the whole invocation. If the provider produces
   * no terminal signal within this window — a hung child, a child that exited
   * without its `close` event being delivered, etc. — the gateway kills the
   * process and rejects, so the step fails instead of freezing forever.
   * Omit to use the gateway's configured default.
   */
  timeoutMs?: number;
};

/** Result of an invocation — metrics come from the provider. */
export type ClaudeCodeInvokeResult = {
  /** Full concatenated output text. */
  output: string;
  tokensIn: number;
  tokensOut: number;
  /**
   * Cache-write input tokens reported by the provider (`cache_creation_input_tokens`
   * for Claude Code). `undefined` when the provider does not do prompt caching.
   */
  cacheCreate?: number;
  /**
   * Cache-read input tokens reported by the provider (`cache_read_input_tokens`
   * for Claude Code, `cached_input_tokens` for Codex). With Claude Code prompt
   * caching this is usually the bulk of the real input — see
   * `specs/run-detail-tokens-cache-manquants.md`.
   */
  cacheRead?: number;
  latencyMs: number;
  costUsd?: number;
  /** Short provider identifier (e.g. `"claude-code"`, `"fake"`). */
  provider: string;
  /** Optional Claude Code session id (debug only — not used to resume). */
  sessionId?: string;
};

export interface LLMGateway {
  /**
   * Executes the request, calling `onEvent` for each typed payload as it
   * streams in, and returns the full result when done. Rejects with a
   * descriptive error on spawn or provider failure.
   */
  invokeStreaming(req: ClaudeCodeInvokeRequest): Promise<ClaudeCodeInvokeResult>;
}
