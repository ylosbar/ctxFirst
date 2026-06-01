import { spawn } from "node:child_process";
import readline from "node:readline";
import type {
  LLMGateway,
  ClaudeCodeInvokeRequest,
  ClaudeCodeInvokeResult,
} from "../../application/ports/outbound/llm-gateway";
import type { LlmSessionPayload } from "../../application/ports/outbound/event-bus";

type Deps = {
  cwd?: string;
  binary?: string;
  /**
   * Default hard timeout (ms) applied when a request does not set its own
   * `timeoutMs`. A claude child that hangs — or that exits without its
   * `close`/`exit` event ever being processed (e.g. the parent event loop was
   * momentarily blocked) — would otherwise freeze the step forever, since the
   * runner simply `await`s this call and the human gate only opens afterwards.
   */
  defaultTimeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is JsonRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const TOOL_RESULT_TRUNCATE_BYTES = 8 * 1024;

const truncateContent = (content: unknown): unknown => {
  if (typeof content === "string") {
    if (content.length <= TOOL_RESULT_TRUNCATE_BYTES) return content;
    return (
      content.slice(0, TOOL_RESULT_TRUNCATE_BYTES) +
      `\n\n…[+${content.length - TOOL_RESULT_TRUNCATE_BYTES} bytes truncated]`
    );
  }
  if (Array.isArray(content)) return content.map(truncateContent);
  return content;
};

const resolveBinary = (override?: string): string =>
  override ?? (process.platform === "win32" ? "claude.cmd" : "claude");

/* eslint-disable no-console */
export const createClaudeCodeLLMGateway = (deps: Deps = {}): LLMGateway => ({
  async invokeStreaming(
    req: ClaudeCodeInvokeRequest,
  ): Promise<ClaudeCodeInvokeResult> {
    const started = Date.now();
    const binary = resolveBinary(deps.binary);
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      req.model,
      "--system-prompt",
      req.systemPrompt,
      "--dangerously-skip-permissions",
    ];
    const cwd = req.cwd ?? deps.cwd;
    console.log(
      `[wf:llm] spawn ${binary} model=${req.model} sys=${req.systemPrompt.length}ch user=${req.userPrompt.length}ch cwd=${cwd ?? process.cwd()}`,
    );
    const child = spawn(binary, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd,
    });

    let streamedText = "";
    let finalResult: string | undefined;
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheCreate: number | undefined;
    let cacheRead: number | undefined;
    let costUsd: number | undefined;
    let sessionId: string | undefined;
    let stderrBuf = "";

    const emit = (payload: LlmSessionPayload) => {
      if (req.onEvent) req.onEvent(payload);
    };

    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      stderrBuf += s;
      for (const line of s.split("\n")) {
        if (line.trim()) console.log(`[wf:llm:stderr] ${line}`);
      }
    });

    const timeoutMs =
      req.timeoutMs ?? deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    const done = new Promise<void>((resolve, reject) => {
      let settled = false;
      let spawnFailed = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        // The child is hung (or already exited without delivering `close`):
        // kill the process tree so it can't linger as a zombie, then reject so
        // the orchestrator marks the step failed instead of freezing it.
        console.error(
          `[wf:llm] timeout after ${timeoutMs}ms — killing claude (pid=${child.pid ?? "?"})`,
        );
        try {
          child.kill("SIGKILL");
        } catch {
          /* already dead */
        }
        const trailer = stderrBuf.trim().slice(-400);
        finish(() =>
          reject(
            new Error(
              `claude timed out after ${timeoutMs}ms${trailer ? `\n${trailer}` : ""}`,
            ),
          ),
        );
      }, timeoutMs);

      child.on("error", (err) => {
        spawnFailed = true;
        console.error(`[wf:llm] spawn error: ${err.message}`);
        finish(() =>
          reject(new Error(`Failed to spawn claude CLI: ${err.message}`)),
        );
      });
      child.stdin.end(req.userPrompt);

      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          return;
        }
        if (!isRecord(parsed)) return;
        const msgType = parsed["type"];

        if (msgType === "system") {
          // Claude Code emits `type:"system"` for several events during one
          // session (init, compaction boundaries, MCP notices…). Only the
          // first — `subtype:"init"` — is a real session start; it's the only
          // one carrying `cwd`/`session_id`. Treating the others as session
          // starts floods the UI with spurious "new session" notifications.
          if (parsed["subtype"] !== "init") return;
          const sid = parsed["session_id"];
          if (typeof sid === "string") sessionId = sid;
          const model =
            typeof parsed["model"] === "string" ? parsed["model"] : req.model;
          const cwd =
            typeof parsed["cwd"] === "string" ? parsed["cwd"] : undefined;
          console.log(`[wf:llm] session=${sessionId ?? "?"} start`);
          emit({ type: "session-start", model, cwd });
          return;
        }

        if (msgType === "assistant") {
          const messageField = parsed["message"];
          if (!isRecord(messageField)) return;
          const content = messageField["content"];
          if (!Array.isArray(content)) return;
          for (const block of content) {
            if (!isRecord(block)) continue;
            const blockType = block["type"];
            if (blockType === "text" && typeof block["text"] === "string") {
              streamedText += block["text"];
              emit({ type: "text-delta", text: block["text"] });
            } else if (blockType === "tool_use") {
              const toolUseId =
                typeof block["id"] === "string" ? block["id"] : "";
              const name =
                typeof block["name"] === "string" ? block["name"] : "(unknown)";
              const input = block["input"];
              console.log(`[wf:llm] tool_use name=${name}`);
              emit({ type: "tool-use", toolUseId, name, input });
            } else if (
              blockType === "thinking" &&
              typeof block["thinking"] === "string"
            ) {
              // Claude Code's stream-json strips raw chain-of-thought: the
              // `thinking` field is always "" (only `signature` is sent for
              // continuation). Skip empty blocks to avoid rendering empty
              // "thinking…" placeholders in the UI.
              const text = block["thinking"];
              if (text.length > 0) emit({ type: "thinking", text });
            }
          }
          const u = messageField["usage"];
          let usage:
            | {
                input: number;
                output: number;
                cacheCreate?: number;
                cacheRead?: number;
              }
            | undefined;
          if (isRecord(u)) {
            const inp = u["input_tokens"];
            const out = u["output_tokens"];
            const cc = u["cache_creation_input_tokens"];
            const cr = u["cache_read_input_tokens"];
            usage = {
              input: typeof inp === "number" ? inp : 0,
              output: typeof out === "number" ? out : 0,
              cacheCreate: typeof cc === "number" ? cc : undefined,
              cacheRead: typeof cr === "number" ? cr : undefined,
            };
          }
          emit({ type: "assistant-message-end", usage });
          return;
        }

        if (msgType === "user") {
          // CLI emits a `user` message right after the model produced a tool_use,
          // containing the tool_result block(s). We surface them so the UI can
          // pair them with the corresponding tool-use.
          const messageField = parsed["message"];
          if (!isRecord(messageField)) return;
          const content = messageField["content"];
          if (!Array.isArray(content)) return;
          for (const block of content) {
            if (!isRecord(block)) continue;
            if (block["type"] !== "tool_result") continue;
            const toolUseId =
              typeof block["tool_use_id"] === "string"
                ? block["tool_use_id"]
                : "";
            const isError = block["is_error"] === true;
            const rawContent = block["content"];
            emit({
              type: "tool-result",
              toolUseId,
              content: truncateContent(rawContent),
              isError,
            });
          }
          return;
        }

        if (msgType === "result") {
          if (
            parsed["is_error"] !== true &&
            typeof parsed["result"] === "string"
          ) {
            finalResult = parsed["result"];
          }
          const usage = parsed["usage"];
          if (isRecord(usage)) {
            const ti = usage["input_tokens"];
            const to = usage["output_tokens"];
            const cc = usage["cache_creation_input_tokens"];
            const cr = usage["cache_read_input_tokens"];
            if (typeof ti === "number") tokensIn = ti;
            if (typeof to === "number") tokensOut = to;
            if (typeof cc === "number") cacheCreate = cc;
            if (typeof cr === "number") cacheRead = cr;
          }
          const cost = parsed["total_cost_usd"];
          if (typeof cost === "number") costUsd = cost;
          const latencyMs = Date.now() - started;
          emit({
            type: "result",
            tokensIn,
            tokensOut,
            cacheCreate,
            cacheRead,
            costUsd,
            latencyMs,
          });
          return;
        }
      });

      const settleByCode = (code: number | null) => {
        if (spawnFailed) return;
        if (code === 0 || code === null) finish(resolve);
        else {
          const trailer = stderrBuf.trim().slice(-400);
          finish(() =>
            reject(
              new Error(
                `claude exited with code ${code}${trailer ? `\n${trailer}` : ""}`,
              ),
            ),
          );
        }
      };

      // `close` fires once stdio streams are fully flushed, so the readline
      // 'line' handlers have already populated the output — settle on it.
      child.on("close", settleByCode);

      // `exit` fires when the process terminates, before stdout is necessarily
      // drained. It's our safety net: if `close` never arrives (pipe held open,
      // or the event that would have delivered it was missed), settle shortly
      // after `exit` so the step can't hang forever waiting on `close`.
      child.on("exit", (code) => {
        if (settled || spawnFailed) return;
        setTimeout(() => settleByCode(code), 2000);
      });
    });

    await done;
    const latencyMs = Date.now() - started;
    const output = finalResult ?? streamedText;
    console.log(
      `[wf:llm] done outputChars=${output.length} tokensIn=${tokensIn} tokensOut=${tokensOut} cost=${costUsd ?? "-"}$ latency=${latencyMs}ms`,
    );
    return {
      output,
      tokensIn,
      tokensOut,
      latencyMs,
      costUsd,
      provider: "claude-code",
      sessionId,
    };
  },
});
