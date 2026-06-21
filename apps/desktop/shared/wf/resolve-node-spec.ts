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
import { extractPlaceholders } from "./placeholders";
import type { NodeSpecView, TemplateVariableView } from "./types";

const readStr = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/**
 * Renderer mirror of the loop runners' `listKindFor` (`loop-foreach.ts` /
 * `loop-collect.ts`): maps a per-iteration item kind to its list-artifact
 * kind, preserving the legacy `MarkdownList` / `PathList` spellings. Lets the
 * editor keep `loop.foreach`/`loop.collect` port kinds in sync with the engine
 * when `config.itemKind` overrides the default `Markdown` (e.g. a
 * `json.transform` producing `List<Json>` wired into a foreach).
 */
const listKindForItem = (itemKind: string): string => {
  if (itemKind === "Path") return "PathList";
  if (itemKind === "Markdown") return "MarkdownList";
  return `List<${itemKind}>`;
};

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
  /**
   * Interface variables of referenced sub-templates, keyed by canonical ref
   * (`id@version`). Lets `workflow.call` derive its ports from the child's
   * `input`/`output` interface — mirrors the engine runner's `resolveSpec`
   * (`plugins/workflow-call.ts`), which the kind-keyed `listNodeSpecs()`
   * catalog cannot express (the base spec has no child context). Without it
   * the editor renders a `workflow.call` node as a portless passthrough and
   * the boundary edges touching it cannot be drawn.
   */
  subTemplates?: ReadonlyMap<string, ReadonlyArray<TemplateVariableView>>;
  /**
   * Saved skill bodies keyed by `ref`. Lets `skill.loader` derive one input
   * port per `{{placeholder}}` — mirrors the engine runner's `resolveSpec`
   * (`plugins/skill-loader.ts`), which the kind-keyed `listNodeSpecs()` catalog
   * cannot express (the base spec has no skill context). The editor supplies it
   * from its cached skill list; without it (or on an unknown ref) the node
   * keeps the permissive `in`-only base, exactly like the runner on a cold
   * snapshot.
   */
  skillBodies?: ReadonlyMap<string, string>;
};

export const resolveNodeSpec = (
  kind: string,
  config: Readonly<Record<string, unknown>>,
  base: NodeSpecView,
  ctx: ResolveNodeSpecContext = {},
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
    case "files.load": {
      // Mirrors `createFilesLoadRunner.resolveSpec` (plugins/files-load.ts):
      // one output port per slot `{ port, subpath, outputKind }`, in
      // declaration order, the first marked `primary`. The static `path` input
      // lives in `base`. A slot is kept only when its port is valid and its
      // `outputKind` is a recognized text-envelope kind; with no valid slot we
      // fall back to the permissive base (no output), exactly like `file.load`.
      const raw = config.slots;
      if (!Array.isArray(raw)) return base;
      const ports: Array<{
        name: string;
        kind: string;
        primary?: boolean;
        description?: string;
      }> = [];
      const seen = new Set<string>();
      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const { port, subpath, outputKind } = item as Record<string, unknown>;
        if (typeof port !== "string" || port.length === 0) continue;
        if (!CASE_NAME_RE.test(port)) continue;
        if (seen.has(port)) continue;
        if (outputKind !== "Markdown" && outputKind !== "Json") continue;
        seen.add(port);
        ports.push({
          name: port,
          kind: outputKind,
          primary: ports.length === 0,
          description:
            typeof subpath === "string" && subpath.length > 0
              ? `${subpath} → ${outputKind}`
              : undefined,
        });
      }
      if (ports.length === 0) return base;
      return { ...base, outputs: ports };
    }
    case "gitlab.files.fetch": {
      // Mirrors `createGitlabFilesFetchRunner.resolveSpec`
      // (plugins/gitlab-files-fetch.ts): one output port per slot
      // `{ port, subpath, outputKind }`, in declaration order, the first marked
      // `primary`. The optional `in` envelope input lives in `base`. A slot is
      // kept only when its port is valid and its `outputKind` is a recognized
      // text-envelope kind; with no valid slot we fall back to the permissive
      // base (no output) — exactly like `files.load`.
      const raw = config.slots;
      if (!Array.isArray(raw)) return base;
      const ports: Array<{
        name: string;
        kind: string;
        primary?: boolean;
        description?: string;
      }> = [];
      const seen = new Set<string>();
      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const { port, subpath, outputKind } = item as Record<string, unknown>;
        if (typeof port !== "string" || port.length === 0) continue;
        if (!CASE_NAME_RE.test(port)) continue;
        if (seen.has(port)) continue;
        if (outputKind !== "Markdown" && outputKind !== "Json") continue;
        seen.add(port);
        ports.push({
          name: port,
          kind: outputKind,
          primary: ports.length === 0,
          description:
            typeof subpath === "string" && subpath.length > 0
              ? `${subpath} → ${outputKind}`
              : undefined,
        });
      }
      if (ports.length === 0) return base;
      return { ...base, outputs: ports };
    }
    case "human.gate": {
      const inputKind = readStr(config.inputKind);
      if (!inputKind) return base;
      // Produces no artifact of its own, but stays chainable: downstream steps
      // resolve their input from the gated upstream artifact (passthrough).
      return {
        ...base,
        inputs: [{ name: "artifact", kinds: [inputKind] }],
        outputs: [],
        passthrough: true,
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
    case "branch.json": {
      // Mirrors `createBranchJsonRunner.resolveSpec` (plugins/branch-json.ts):
      // reads `cases` (≥2 unique port-safe labels) + optional `inputKind`
      // (default Json), one passthrough port per case. The `json` input accepts
      // any kind. Falls back to permissive base when `cases` is malformed.
      const cases = readCases(config.cases);
      if (!cases) return base;
      const passthroughKind = readStr(config.inputKind) ?? "Json";
      const path = readStr(config.path);
      return {
        ...base,
        inputs: [{ name: "json", kinds: ["*"], primary: true }],
        outputs: cases.map((c) => ({
          name: c,
          kind: passthroughKind,
          description: path
            ? `Branch when ${path} equals "${c}".`
            : `Branch when the JSON field equals "${c}".`,
        })),
      };
    }
    case "select.markdown": {
      // Mirrors `createSelectMarkdownRunner.resolveSpec`
      // (plugins/select-markdown.ts). Ports are STATIC (independent of
      // `config.path`): a primary `cond` (any kind, carries the flag), an
      // optional `value` Markdown|Json fragment, and a single primary `out`
      // Markdown. Unlike `branch.*` there is no per-case fan-out, so the
      // shape never depends on config — we override the permissive base
      // unconditionally (the engine's `listNodeSpecs` falls back to
      // `input?`/`out` because `resolveSpec` throws on empty config).
      return {
        ...base,
        inputs: [
          { name: "cond", kinds: ["*"], primary: true },
          { name: "value", kinds: ["Markdown", "Json"], optional: true },
        ],
        outputs: [{ name: "out", kind: "Markdown", primary: true }],
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
    case "workflow.call": {
      // Mirrors `createWorkflowCallRunner.resolveSpec` (plugins/workflow-call.ts):
      // ports are derived from the referenced sub-template's interface variables
      // — one input per `input` role, one output per `output` role. The child's
      // variables come from `ctx.subTemplates` (the editor supplies them from
      // its loaded template list); without them we fall back to the portless
      // base spec, exactly like the runner when the snapshot misses the child.
      const id = readStr(config.templateId);
      const version = readStr(config.templateVersion);
      if (!id || !version) return base;
      const vars = ctx.subTemplates?.get(`${id}@${version}`);
      if (!vars) return base;
      return {
        ...base,
        inputs: vars
          .filter((v) => v.role === "input")
          .map((v) => ({ name: v.name, kinds: [v.kind] })),
        outputs: vars
          .filter((v) => v.role === "output")
          .map((v) => ({ name: v.name, kind: v.kind })),
      };
    }
    case "template.invoke": {
      // Mirrors `createTemplateInvokeRunner.resolveSpec` (plugins/template-invoke.ts).
      // Identical port derivation to `workflow.call` — one input per `input`
      // role, one output per `output` role — but Approach A (spawns a child
      // instance) rather than inlining. Child variables come from
      // `ctx.subTemplates`; on a miss we fall back to the portless base.
      const id = readStr(config.templateId);
      const version = readStr(config.templateVersion);
      if (!id || !version) return base;
      const vars = ctx.subTemplates?.get(`${id}@${version}`);
      if (!vars) return base;
      return {
        ...base,
        inputs: vars
          .filter((v) => v.role === "input")
          .map((v) => ({ name: v.name, kinds: [v.kind] })),
        outputs: vars
          .filter((v) => v.role === "output")
          .map((v) => ({ name: v.name, kind: v.kind })),
      };
    }
    case "skill.loader": {
      // Mirrors `createSkillLoaderRunner.resolveSpec` (plugins/skill-loader.ts):
      // one optional `Markdown|Json` input port per `{{placeholder}}` in the
      // referenced skill's body, plus the `in` chaining port (kept first unless
      // a literal `{{in}}` placeholder shadows it). The body comes from
      // `ctx.skillBodies` (the editor supplies it from its cached skill list);
      // without it, or on an unknown ref, we fall back to the permissive base
      // (`in` only) — exactly like the runner on a cold snapshot.
      const ref = readStr(config.skillRef);
      const body = ref ? ctx.skillBodies?.get(ref) : undefined;
      if (body === undefined) return base;
      const names = extractPlaceholders(body);
      const placeholderPorts = names.map((name) => ({
        name,
        kinds: ["Markdown", "Json"],
        optional: true,
      }));
      const inputs = names.includes("in")
        ? placeholderPorts
        : [{ name: "in", kinds: ["*"], optional: true }, ...placeholderPorts];
      return { ...base, inputs };
    }
    case "markdown.template": {
      // Mirrors `createMarkdownTemplateRunner.resolveSpec`
      // (plugins/markdown-template.ts): one optional `Markdown|Json` input port
      // per `{{placeholder}}` in the inline `config.template`, plus the `in`
      // chaining port (kept first unless a literal `{{in}}` placeholder shadows
      // it). Unlike `skill.loader`, the template lives in the config — no
      // snapshot needed; an empty/absent template degrades to the permissive
      // base (`in` only).
      const template = readStr(config.template);
      if (!template) return base;
      const names = extractPlaceholders(template);
      const placeholderPorts = names.map((name) => ({
        name,
        kinds: ["Markdown", "Json"],
        optional: true,
      }));
      const inputs = names.includes("in")
        ? placeholderPorts
        : [{ name: "in", kinds: ["*"], optional: true }, ...placeholderPorts];
      return { ...base, inputs };
    }
    case "loop.foreach": {
      // Mirror `createLoopForeachRunner.resolveSpec`: `config.itemKind`
      // (default `Markdown`) drives the `items` input kind (`listKindFor`) and
      // the per-iteration `item` output kind. Absent ⇒ `base` already carries
      // the `Markdown`/`MarkdownList` defaults from `listNodeSpecs()`.
      const itemKind = readStr(config.itemKind);
      if (!itemKind) return base;
      const listKind = listKindForItem(itemKind);
      return {
        ...base,
        inputs: base.inputs.map((p) =>
          p.name === "items" ? { ...p, kinds: [listKind] } : p,
        ),
        outputs: base.outputs.map((p) =>
          p.name === "item" ? { ...p, kind: itemKind } : p,
        ),
      };
    }
    case "loop.collect": {
      // Symmetric to `loop.foreach`: `config.itemKind` drives the `item` input
      // kind and the aggregated `items` output kind (`listKindFor`).
      const itemKind = readStr(config.itemKind);
      if (!itemKind) return base;
      const listKind = listKindForItem(itemKind);
      return {
        ...base,
        inputs: base.inputs.map((p) =>
          p.name === "item" ? { ...p, kinds: [itemKind] } : p,
        ),
        outputs: base.outputs.map((p) =>
          p.name === "items" ? { ...p, kind: listKind } : p,
        ),
      };
    }
    default:
      return base;
  }
};
