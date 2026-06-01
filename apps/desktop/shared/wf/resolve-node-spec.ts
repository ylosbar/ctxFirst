/**
 * Renderer-side mirror of the engine runners' `resolveSpec`. Given a step's
 * `kind` + `config`, returns the {@link NodeSpecView} that the engine would
 * compute for it. Used by the template editor to keep colors, handles and
 * `isValidConnection` synced with what `validateTemplatePorts` will enforce
 * on save.
 *
 * The `base` argument is the config-default spec returned by
 * `listNodeSpecs()` over IPC; polymorphic runners may throw at the base stage
 * (config is empty), so `base` is allowed to be a permissive fallback. When
 * the step's config carries the polymorphic discriminator, we override the
 * relevant fields on top of `base`.
 *
 * Keeping this in `shared/` means main and renderer agree on the rules; when
 * a new discriminator is added to a runner, this file is the single source
 * of truth on the renderer side.
 */
import { isSumArtifactKind, parseSumArtifactKind } from "./artifact-kind-grammar";
import type { NodeSpecView, TemplateVariableView } from "./types";

const readStr = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const CASE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

type ExitCodeValue = number | "timeout";
type ExitCodePort = {
  name: string;
  codes: ReadonlyArray<ExitCodeValue> | "*";
};

const PORT_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const RESERVED_EXIT_PORTS: ReadonlySet<string> = new Set(["stdout", "stderr"]);

/**
 * Renderer-side tolerant parse of `shell.exec`'s `exitCodes` config. Mirrors
 * the engine's `parseExitCodes` validation: any violation returns `null`
 * (the caller falls back to the legacy `success`/`failure` ports). Output
 * is the same insertion-ordered list so the editor preview matches what
 * `validateTemplatePorts` will see at save-time.
 */
const readExitCodes = (v: unknown): ReadonlyArray<ExitCodePort> | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length < 2) return null;
  const seenCodes = new Set<number | "timeout">();
  const seenPorts = new Set<string>();
  let catchAlls = 0;
  const out: ExitCodePort[] = [];
  for (const [port, value] of entries) {
    if (!PORT_NAME_RE.test(port)) return null;
    if (RESERVED_EXIT_PORTS.has(port)) return null;
    if (seenPorts.has(port)) return null;
    seenPorts.add(port);
    if (value === "*") {
      catchAlls += 1;
      out.push({ name: port, codes: "*" });
      continue;
    }
    if (!Array.isArray(value) || value.length === 0) return null;
    const codes: ExitCodeValue[] = [];
    for (const c of value) {
      const ok =
        c === "timeout" ||
        (typeof c === "number" && Number.isInteger(c) && c >= -128 && c <= 255);
      if (!ok) return null;
      const code = c as ExitCodeValue;
      if (seenCodes.has(code)) return null;
      seenCodes.add(code);
      codes.push(code);
    }
    out.push({ name: port, codes });
  }
  if (catchAlls !== 1) return null;
  return out;
};

const describeExitCodePort = (
  codes: ReadonlyArray<ExitCodeValue> | "*",
): string => {
  if (codes === "*") return "catch-all (any other exit code).";
  const parts = codes.map((c) => (c === "timeout" ? "timeout" : String(c)));
  return `Branch taken on ${parts.join(", ")}.`;
};

const readCases = (v: unknown): ReadonlyArray<string> | null => {
  if (!Array.isArray(v) || v.length < 2) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of v) {
    if (typeof c !== "string" || c.length === 0) return null;
    if (seen.has(c)) return null;
    if (!CASE_NAME_RE.test(c)) return null;
    seen.add(c);
    out.push(c);
  }
  return out;
};

/**
 * Optional template context — passed by editors that have access to the
 * current template draft so that template-aware kinds resolve their port
 * kinds from the declared variables. Kept so future polymorphic kinds can
 * read the variable list without a separate prop drilling pass.
 */
export type ResolveNodeSpecContext = {
  variables?: ReadonlyArray<TemplateVariableView>;
};

export const resolveNodeSpec = (
  kind: string,
  config: Readonly<Record<string, unknown>>,
  base: NodeSpecView,
  _ctx: ResolveNodeSpecContext = {},
): NodeSpecView => {
  switch (kind) {
    case "user.input": {
      const outputKind = readStr(config.outputKind);
      if (!outputKind) return base;
      const baseOut = base.outputs[0];
      return {
        ...base,
        inputs: [],
        outputs: [{ name: baseOut?.name ?? "out", kind: outputKind }],
      };
    }
    case "claude_code.invoke":
    case "codex.invoke": {
      const outputKind = readStr(config.outputKind);
      if (!outputKind) return base;
      const baseOut = base.outputs[0];
      return {
        ...base,
        inputs: [{ name: "prompt", kinds: ["*"] }],
        outputs: [{ name: baseOut?.name ?? "out", kind: outputKind }],
      };
    }
    case "openrouter.invoke": {
      const outputKind = readStr(config.outputKind);
      if (!outputKind) return base;
      const baseOut = base.outputs[0];
      return {
        ...base,
        inputs: [{ name: "prompt", kinds: ["*"] }],
        outputs: [{ name: baseOut?.name ?? "out", kind: outputKind }],
      };
    }
    case "transform.run": {
      const outputKind = readStr(config.outputKind);
      if (!outputKind) return base;
      return {
        ...base,
        inputs: [{ name: "src", kinds: ["*"], primary: true }],
        outputs: [{ name: "out", kind: outputKind }],
      };
    }
    case "webhook.call": {
      const outputKind = readStr(config.outputKind);
      if (!outputKind) return base;
      return {
        ...base,
        inputs: [
          { name: "url", kinds: ["Markdown", "*"], primary: true },
          { name: "body", kinds: ["*"], optional: true },
        ],
        outputs: [{ name: "out", kind: outputKind }],
      };
    }
    case "file.load": {
      // Mirrors `createFileLoadRunner.resolveSpec` (plugins/file-load.ts):
      // the static `path` input lives in `base`; only the `out` port is
      // polymorphic, restricted to text-envelope kinds (Markdown | Json).
      const outputKind = readStr(config.outputKind);
      if (outputKind !== "Markdown" && outputKind !== "Json") return base;
      return {
        ...base,
        outputs: [{ name: "out", kind: outputKind, primary: true }],
      };
    }
    case "human.gate": {
      const inputKind = readStr(config.inputKind);
      if (!inputKind) return base;
      return {
        ...base,
        inputs: [{ name: "artifact", kinds: [inputKind] }],
        outputs: [],
      };
    }
    case "shell.exec": {
      const mapping = readExitCodes(config.exitCodes);
      if (!mapping) return base;
      const branchPorts = mapping.map(({ name, codes }, i) => ({
        name,
        kind: "Markdown",
        primary: i === 0,
        description: describeExitCodePort(codes),
      }));
      return {
        ...base,
        outputs: [
          ...branchPorts,
          {
            name: "stdout",
            kind: "Markdown",
            description: "Verbatim stdout stream. Always produced.",
          },
          {
            name: "stderr",
            kind: "Markdown",
            description: "Verbatim stderr stream. Always produced.",
          },
        ],
      };
    }
    case "branch.bool": {
      const cases = readCases(config.cases);
      if (!cases) return base;
      const passthroughKind = readStr(config.inputKind) ?? "Markdown";
      return {
        ...base,
        inputs: [{ name: "verdict", kinds: ["Markdown"], primary: true }],
        outputs: cases.map((c) => ({
          name: c,
          kind: passthroughKind,
          description: `Branch when verdict equals "${c}".`,
        })),
      };
    }
    case "branch.match": {
      // Mirrors `createBranchMatchRunner.resolveSpec` (plugins/branch-match.ts).
      // `targetKind` is a `OneOf<A,B,…>` sum; each variant becomes an
      // `out_<variant>` port typed of that variant. Port-name encoding is kept
      // verbatim with the runner so the orchestrator routes consistently.
      const target = readStr(config.targetKind);
      if (!target || !isSumArtifactKind(target)) return base;
      const variants = parseSumArtifactKind(target);
      if (!variants) return base;
      return {
        ...base,
        inputs: [{ name: "in", kinds: [target], primary: true }],
        outputs: variants.map((v) => ({
          name: `out_${v}`,
          kind: v,
          description: `Selected when the input variant is ${v}.`,
        })),
      };
    }
    case "json.transform": {
      const raw = config.transformations;
      if (!Array.isArray(raw)) return base;
      const ports: Array<{
        name: string;
        kind: string;
        description?: string;
      }> = [];
      const seen = new Set<string>();
      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const { port, expression, wrap, itemKind } = item as Record<
          string,
          unknown
        >;
        if (typeof port !== "string" || port.length === 0) continue;
        if (!CASE_NAME_RE.test(port)) continue;
        if (seen.has(port)) continue;
        seen.add(port);
        // Mirror `createJsonTransformRunner.resolveSpec`: `wrap: "list"` emits a
        // list artifact whose kind depends on `itemKind` (Markdown → legacy
        // `MarkdownList`, otherwise canonical `List<Json>`); else a `Json`.
        const kind =
          wrap === "list"
            ? itemKind === "Markdown"
              ? "MarkdownList"
              : "List<Json>"
            : "Json";
        ports.push({
          name: port,
          kind,
          description:
            typeof expression === "string" && expression.length > 0
              ? `JSONPath: ${expression}${wrap === "list" ? ` (→ ${kind})` : ""}`
              : undefined,
        });
      }
      if (ports.length === 0) return base;
      return {
        ...base,
        inputs: [{ name: "json", kinds: ["*"], primary: true }],
        outputs: ports,
      };
    }
    default:
      return base;
  }
};
