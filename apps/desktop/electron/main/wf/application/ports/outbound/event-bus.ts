/**
 * In-memory pub/sub ports used by the orchestrator and the IPC forwarder.
 *
 * - {@link EventBus} carries {@link DomainEvent}s published by use-cases.
 *   Multiple subscribers receive each event sequentially.
 * - {@link LlmSessionBus} carries live typed events from `claude_code.invoke`
 *   (text deltas, tool uses, tool results, thinking, …). Persisted to
 *   SQLite (`wf_llm_session_events`) so that late subscribers (e.g. the
 *   side-panel opened after the step started, or a fresh app launch)
 *   can replay the full session via {@link LlmSessionBus.getReplay}.
 *
 * Implementations: `createInMemoryEventBus` / `createSqliteLlmSessionBus`.
 */
import type { DomainEvent } from "../../../domain/events";

/** Handler invoked on every published event. May be sync or async. */
export type DomainEventHandler = (evt: DomainEvent) => Promise<void> | void;

/** Returned by `subscribe` to let callers detach. */
export type Unsubscribe = () => void;

export interface EventBus {
  /**
   * Publishes an event to every subscriber. Subscribers are awaited
   * sequentially; heavy subscribers should schedule their work asynchronously
   * to avoid blocking the publisher (see the orchestrator's `schedule`).
   */
  publish(evt: DomainEvent): Promise<void>;
  subscribe(handler: DomainEventHandler): Unsubscribe;
}

/**
 * Typed event captured from a Claude Code session during an `claude_code.invoke`
 * step. Multiple events are emitted per step execution (one per assistant
 * message block, tool use, tool result, …) and ordered by `seq`.
 */
export type LlmSessionEvent = {
  stepExecId: string;
  /** Monotonic sequence (per stepExecId) so the renderer can sort/dedupe. */
  seq: number;
  /** Claude Code session identifier (debug only — not used to resume). */
  sessionId?: string;
  payload: LlmSessionPayload;
};

export type LlmSessionPayload =
  | { type: "session-start"; model: string; cwd?: string }
  | { type: "text-delta"; text: string }
  | { type: "tool-use"; toolUseId: string; name: string; input: unknown }
  | {
      type: "tool-result";
      toolUseId: string;
      content: unknown;
      isError: boolean;
    }
  | { type: "thinking"; text: string }
  | {
      type: "assistant-message-end";
      usage?: {
        input: number;
        output: number;
        cacheCreate?: number;
        cacheRead?: number;
      };
    }
  | {
      type: "result";
      tokensIn: number;
      tokensOut: number;
      cacheCreate?: number;
      cacheRead?: number;
      costUsd?: number;
      latencyMs: number;
    };

/** Handler invoked on every emitted session event. Synchronous for low latency. */
export type LlmSessionHandler = (evt: LlmSessionEvent) => void;

export interface LlmSessionBus {
  emit(evt: LlmSessionEvent): void;
  subscribe(handler: LlmSessionHandler): Unsubscribe;
  /**
   * Returns all persisted events for a `stepExecId` (oldest first by `seq`).
   * Used for replay when a renderer subscribes after events were emitted —
   * including across app restarts.
   */
  getReplay(stepExecId: string): ReadonlyArray<LlmSessionEvent>;
}
