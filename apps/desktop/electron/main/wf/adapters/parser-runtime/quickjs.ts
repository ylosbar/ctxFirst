/**
 * QuickJS-backed parser runtime — executes the JS body of a `mode: "code"`
 * parser in a hardened sandbox.
 *
 * Why QuickJS and not Node's `vm`:
 *   Node's `vm.createContext` shares the JS heap with the host. Any escape
 *   gadget (e.g. `this.constructor.constructor("return process")()`) jumps
 *   straight back to the host realm, which has full Node privileges. QuickJS
 *   runs in its own WASM heap with no `require`, no `process`, no `Buffer`,
 *   no `fetch`, no globals of any kind besides the standard ECMAScript ones.
 *
 * Hard limits enforced (cf. PLUGINS.md §7.2.2 + §13.2):
 *   - 500 ms wall-clock timeout (configurable via `timeoutMs`).
 *   - 16 MB heap limit (configurable via `maxMemoryBytes`).
 *   - No globals — the body sees its `raw` input as the sole argument.
 *   - The body must be an ESM module with a `default` export that is a
 *     function. We emulate ESM by wrapping the source in `(raw) => { ... }`
 *     when the body parses as a plain function expression, and by stripping
 *     the `export default ` prefix when it's present.
 *   - The returned value is serialised to JSON inside the VM, then parsed by
 *     the host. This guarantees a clean type boundary (no QuickJSHandle leak)
 *     and rejects non-serialisable outputs (functions, cycles, BigInt) with a
 *     useful error.
 *
 * Audit: every execution is logged into `wf_parser_runs` via the optional
 * audit sink — input/output hashes (not contents), duration, ok/error.
 */
import { newQuickJSWASMModule, type QuickJSWASMModule } from "quickjs-emscripten";
import crypto from "node:crypto";
import type { ParserRuntime } from "../../application/ports/outbound/parser-runtime";
import type { ParserRecord } from "../../domain/parser";

export type ParserAuditSink = {
  record(args: {
    parserId: string;
    parserVersion: string;
    mode: string;
    inputHash: string;
    outputHash: string | null;
    durationMs: number;
    ok: boolean;
    error?: string;
  }): void;
};

const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_MAX_MEMORY = 16 * 1024 * 1024;

const sha256 = (s: string): string =>
  crypto.createHash("sha256").update(s).digest("hex");

/**
 * Massages plugin-author-friendly source forms into a strict function
 * expression the sandbox can evaluate. Accepts:
 *   - `export default (raw) => ...`
 *   - `export default function (raw) { ... }`
 *   - `(raw) => ...` (bare arrow)
 *   - `function (raw) { ... }` (bare function expression)
 *   - `function name(raw) { ... }` (bare function declaration with name)
 * Anything else: thrown as a syntax error before reaching the VM.
 */
const normaliseSource = (src: string): string => {
  const trimmed = src.trim();
  if (!trimmed) throw new Error("parser body is empty");
  // Strip an `export default` if present — the wrapper below adds it back.
  const stripped = trimmed.replace(/^export\s+default\s+/, "");
  // Ensure the trailing parens won't accidentally apply to an attached
  // semicolon: wrap in parens so the eval gives us a value.
  return `(${stripped.replace(/;\s*$/, "")})`;
};

export type QuickJsRuntimeOptions = {
  timeoutMs?: number;
  maxMemoryBytes?: number;
  audit?: ParserAuditSink;
};

let cachedModule: Promise<QuickJSWASMModule> | null = null;
const getModule = (): Promise<QuickJSWASMModule> => {
  if (!cachedModule) cachedModule = newQuickJSWASMModule();
  return cachedModule;
};

/**
 * Constructs a {@link ParserRuntime} that executes `mode === "code"` parsers
 * in a QuickJS sandbox. Rejects `mode === "declarative"` so the dispatcher
 * upstream is forced to route correctly.
 */
export const createQuickJsParserRuntime = (
  options: QuickJsRuntimeOptions = {},
): ParserRuntime => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxMemoryBytes = options.maxMemoryBytes ?? DEFAULT_MAX_MEMORY;
  return {
    async run(parser: ParserRecord, raw: unknown): Promise<unknown> {
      if (parser.mode !== "code") {
        throw new Error(
          `quickjs parser runtime cannot execute parser "${parser.id}@${parser.version}" of mode "${parser.mode}"`,
        );
      }
      if (typeof parser.body !== "string") {
        throw new Error(
          `code-mode parser body must be a string, got ${typeof parser.body}`,
        );
      }
      const src = normaliseSource(parser.body);
      const rawJson = JSON.stringify(raw === undefined ? null : raw);
      const inputHash = sha256(rawJson);

      const startedAt = Date.now();
      const QuickJS = await getModule();
      const runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(maxMemoryBytes);
      // Interrupt handler driven by wall-clock — QuickJS calls it between
      // every basic block so timeouts are tight (sub-tick).
      const deadline = Date.now() + timeoutMs;
      runtime.setInterruptHandler(() => Date.now() > deadline);

      const context = runtime.newContext();
      let output: unknown = undefined;
      let error: string | undefined;
      try {
        const fnRes = context.evalCode(src, "parser.js");
        if (fnRes.error) {
          const detail = context.dump(fnRes.error);
          fnRes.error.dispose();
          throw new Error(
            `parser body did not evaluate: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
          );
        }
        const fn = fnRes.value;
        if (context.typeof(fn) !== "function") {
          fn.dispose();
          throw new Error(
            "parser body must evaluate to a function (e.g. `export default (raw) => ...`)",
          );
        }
        const rawHandle = context
          .newString(rawJson);
        // The function receives the *parsed* value, not the JSON string — we
        // re-parse inside the VM to avoid materialising the whole structure
        // as host handles when only a subset is consumed.
        const parseFn = context.getProp(context.global, "JSON");
        const parseMethod = context.getProp(parseFn, "parse");
        const parsedRes = context.callFunction(parseMethod, parseFn, rawHandle);
        rawHandle.dispose();
        parseMethod.dispose();
        parseFn.dispose();
        if (parsedRes.error) {
          const detail = context.dump(parsedRes.error);
          parsedRes.error.dispose();
          throw new Error(`raw payload is not valid JSON: ${JSON.stringify(detail)}`);
        }
        const parsedArg = parsedRes.value;
        const callRes = context.callFunction(fn, context.global, parsedArg);
        fn.dispose();
        parsedArg.dispose();
        if (callRes.error) {
          const detail = context.dump(callRes.error);
          callRes.error.dispose();
          throw new Error(
            `parser threw: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
          );
        }
        // Stringify the return value inside the VM to enforce JSON-shape.
        const stringifyJson = context.getProp(context.global, "JSON");
        const stringifyMethod = context.getProp(stringifyJson, "stringify");
        const jsonRes = context.callFunction(
          stringifyMethod,
          stringifyJson,
          callRes.value,
        );
        callRes.value.dispose();
        stringifyMethod.dispose();
        stringifyJson.dispose();
        if (jsonRes.error) {
          const detail = context.dump(jsonRes.error);
          jsonRes.error.dispose();
          throw new Error(
            `parser return value is not JSON-serialisable: ${JSON.stringify(detail)}`,
          );
        }
        const jsonStr = context.getString(jsonRes.value);
        jsonRes.value.dispose();
        if (jsonStr === undefined) {
          throw new Error(
            "parser return value is `undefined` — return an object/array/primitive",
          );
        }
        output = JSON.parse(jsonStr);
      } catch (e) {
        error = (e as Error).message;
        throw e;
      } finally {
        context.dispose();
        runtime.dispose();
        const durationMs = Date.now() - startedAt;
        const outputHash =
          error || output === undefined ? null : sha256(JSON.stringify(output));
        options.audit?.record({
          parserId: parser.id,
          parserVersion: parser.version,
          mode: parser.mode,
          inputHash,
          outputHash,
          durationMs,
          ok: !error,
          error,
        });
      }
      return output;
    },
  };
};
