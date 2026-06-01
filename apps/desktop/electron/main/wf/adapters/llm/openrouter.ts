/**
 * Thin OpenRouter chat-completions client. Ported from the OpenRouter
 * built-in plugin to the engine core — the step runner consumes it directly,
 * and (eventually) the Pi-driven chat reads the same credentials via
 * {@link OpenRouterCredentials}.
 *
 * Runs in the main process; not subject to the renderer CSP. The host's
 * previous `api.net.fetch` host allow-list disappears with the migration,
 * but only this module talks to `openrouter.ai`, which makes the perimeter
 * narrow enough.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterCompleteArgs = {
  model: string;
  messages: ReadonlyArray<OpenRouterMessage>;
  maxTokens?: number;
};

export type OpenRouterCompleteResult = {
  content: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  provider: "openrouter";
  modelUsed: string;
};

export type OpenRouterClient = {
  complete(args: OpenRouterCompleteArgs): Promise<OpenRouterCompleteResult>;
};

type Deps = {
  /** Resolves the API key at call time. `null` means no key configured. */
  getApiKey: () => Promise<string | null>;
};

export const createOpenRouterClient = ({ getApiKey }: Deps): OpenRouterClient => ({
  async complete({ model, messages, maxTokens }) {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error(
        "OpenRouter API key is missing. Open Settings → Modèles LLM and paste your key.",
      );
    }

    const body: Record<string, unknown> = { model, messages };
    if (typeof maxTokens === "number" && maxTokens > 0) {
      body.max_tokens = maxTokens;
    }

    const started = Date.now();
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ctxfirst.com/ctxfirst",
        "X-Title": "CtxFirst Desktop",
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OpenRouter call failed (HTTP ${response.status})${text ? ` — ${text.slice(0, 300)}` : ""}`,
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      model?: unknown;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };

    const choice = Array.isArray(json.choices) ? json.choices[0] : null;
    const rawContent =
      choice && choice.message && typeof choice.message.content === "string"
        ? choice.message.content
        : "";
    const usage = json.usage ?? {};
    return {
      content: rawContent,
      tokensIn: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
      tokensOut:
        typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
      latencyMs,
      provider: "openrouter",
      modelUsed: typeof json.model === "string" && json.model.length > 0 ? json.model : model,
    };
  },
});
