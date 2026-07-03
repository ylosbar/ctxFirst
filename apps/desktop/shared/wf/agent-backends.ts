/**
 * Registry of the **coding-agent backends** an `agent.invoke` / `agent.judge`
 * node can select via `config.provider`.
 *
 * This is the single source of truth shared main ↔ renderer (like
 * `resolve-node-spec.ts`): the runners use it for the default provider + model
 * and to validate an unknown provider; the inspector uses it to render the
 * provider `Select` and to reset the model field when the provider changes.
 *
 * A backend is only listed here when it implements the agnostic `LLMGateway`
 * contract (agentic, streaming, tools, `cwd`) — see
 * `specs/agent-backend-agnostic-nodes.md` §Périmètre. Adding a future backend
 * (Gemini CLI, opencode, a raw streaming API…) is one adapter + one entry here,
 * zero new node.
 *
 * The `models` list is a UI suggestion only; keeping the model catalogue fresh
 * is orthogonal to this feature. The `defaultModel` values intentionally match
 * the previous hard-coded runner defaults (`claude-opus-4-7` / `gpt-5-codex`)
 * so migrating a `claude_code.*` / `codex.invoke` node stays behaviour-preserving.
 */

export type AgentProvider = "claude-code" | "codex";

export type AgentBackendMeta = {
  readonly id: AgentProvider;
  readonly label: string;
  readonly defaultModel: string;
  /** Suggestions for the future model Select; free-text in v1. */
  readonly models: readonly string[];
};

export const AGENT_BACKENDS: readonly AgentBackendMeta[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    defaultModel: "claude-opus-4-7",
    models: ["claude-opus-4-7", "claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  {
    id: "codex",
    label: "Codex (OpenAI)",
    defaultModel: "gpt-5-codex",
    models: ["gpt-5-codex"],
  },
];

export const DEFAULT_AGENT_PROVIDER: AgentProvider = "claude-code";

const BY_ID = new Map<AgentProvider, AgentBackendMeta>(
  AGENT_BACKENDS.map((b) => [b.id, b]),
);

export const isKnownProvider = (v: unknown): v is AgentProvider =>
  typeof v === "string" && BY_ID.has(v as AgentProvider);

export const defaultModelFor = (p: AgentProvider): string =>
  BY_ID.get(p)?.defaultModel ?? AGENT_BACKENDS[0]!.defaultModel;
