/**
 * Declarative parser interpreter — pure interpretation of the operations
 * tree carried by a parser whose `mode === "declarative"`. No sandbox: the
 * tree has no Turing-completeness, so a tree walker is enough (cf.
 * PLUGINS.md §7.2.1, §7.5).
 *
 * Grammar:
 *  - `body = { operations: ParserOperation[] }`
 *  - operations thread the accumulator left-to-right (`pick`, `map`,
 *    `filter`, `limit`)
 *  - paths are dotted JSON paths anchored at `$` (the current accumulator,
 *    or — inside `map.fields` — the current item). Property names and
 *    numeric array indices are supported (`$.a.b[0]`); no wildcard, no
 *    quoted keys, no expressions.
 *
 * Errors carry the operation index so the UI playground can underline the
 * faulty step in the operations list (Phase 2).
 */
import type { ParserRuntime } from "../../application/ports/outbound/parser-runtime";
import type { ParserRecord } from "../../domain/parser";

type ParserOperation =
  | { op: "pick"; path: string }
  | {
      op: "map";
      /** Source array path relative to the current accumulator. Defaults to "$". */
      from?: string;
      fields: Record<string, string | ParserOperation>;
    }
  | {
      op: "filter";
      path: string;
      /** Strict-equal predicate; mutually exclusive with `exists`. */
      equals?: unknown;
      /**
       * `true` keeps items whose `path` resolves to a non-null/undefined
       * value; `false` keeps items whose `path` resolves to null/undefined;
       * unset falls back to a truthy check.
       */
      exists?: boolean;
    }
  | { op: "limit"; n: number };

type DeclarativeBody = {
  operations: ReadonlyArray<ParserOperation>;
};

export class ParserExecutionError extends Error {
  constructor(
    message: string,
    public readonly opIndex: number,
    public readonly op?: ParserOperation,
  ) {
    super(message);
    this.name = "ParserExecutionError";
  }
}

const PATH_RE = /^\$(?:(?:\.[A-Za-z_][A-Za-z0-9_-]*)|(?:\[\d+\]))*$/;
const SEGMENT_RE = /\.([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]/g;

const parsePath = (path: string): ReadonlyArray<string | number> => {
  if (!PATH_RE.test(path)) {
    throw new Error(`invalid path "${path}"`);
  }
  if (path === "$") return [];
  const segments: (string | number)[] = [];
  SEGMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEGMENT_RE.exec(path)) !== null) {
    if (m[1] !== undefined) segments.push(m[1]);
    else segments.push(Number.parseInt(m[2], 10));
  }
  return segments;
};

const typeOf = (v: unknown): string => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
};

const evalPath = (value: unknown, path: string): unknown => {
  const segments = parsePath(path);
  let cur: unknown = value;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) {
        throw new Error(`expected array at "${path}", got ${typeOf(cur)}`);
      }
      cur = cur[seg];
    } else {
      if (typeof cur !== "object" || Array.isArray(cur)) {
        throw new Error(`expected object at "${path}", got ${typeOf(cur)}`);
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return cur;
};

const applyFields = (
  item: unknown,
  fields: Record<string, string | ParserOperation>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, expr] of Object.entries(fields)) {
    out[k] = typeof expr === "string" ? evalPath(item, expr) : applyOp(item, expr);
  }
  return out;
};

const applyOp = (acc: unknown, op: ParserOperation): unknown => {
  switch (op.op) {
    case "pick":
      return evalPath(acc, op.path);
    case "map": {
      const source = op.from === undefined ? acc : evalPath(acc, op.from);
      if (!Array.isArray(source)) {
        throw new Error(`map expects an array source, got ${typeOf(source)}`);
      }
      if (!op.fields || typeof op.fields !== "object") {
        throw new Error(`map requires a "fields" object`);
      }
      return source.map((item) => applyFields(item, op.fields));
    }
    case "filter": {
      if (!Array.isArray(acc)) {
        throw new Error(`filter expects an array, got ${typeOf(acc)}`);
      }
      const hasEquals = Object.prototype.hasOwnProperty.call(op, "equals");
      const hasExists = op.exists !== undefined;
      if (hasEquals && hasExists) {
        throw new Error(`filter cannot use both "equals" and "exists"`);
      }
      return acc.filter((item) => {
        const v = evalPath(item, op.path);
        if (hasEquals) return Object.is(v, op.equals);
        if (op.exists === true) return v !== null && v !== undefined;
        if (op.exists === false) return v === null || v === undefined;
        return Boolean(v);
      });
    }
    case "limit": {
      if (!Array.isArray(acc)) {
        throw new Error(`limit expects an array, got ${typeOf(acc)}`);
      }
      if (typeof op.n !== "number" || !Number.isFinite(op.n) || op.n < 0) {
        throw new Error(`limit "n" must be a non-negative finite number`);
      }
      return acc.slice(0, Math.floor(op.n));
    }
    default: {
      const _exhaustive: never = op;
      throw new Error(`unknown op: ${JSON.stringify(_exhaustive)}`);
    }
  }
};

const parseBody = (body: unknown): DeclarativeBody => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`declarative body must be an object`);
  }
  const ops = (body as { operations?: unknown }).operations;
  if (!Array.isArray(ops)) {
    throw new Error(`declarative body must have an "operations" array`);
  }
  return { operations: ops as ReadonlyArray<ParserOperation> };
};

export const createDeclarativeParserRuntime = (): ParserRuntime => ({
  async run(parser: ParserRecord, raw: unknown): Promise<unknown> {
    if (parser.mode !== "declarative") {
      throw new Error(
        `declarative parser runtime cannot execute parser "${parser.id}@${parser.version}" of mode "${parser.mode}"`,
      );
    }
    const body = parseBody(parser.body);
    let acc: unknown = raw;
    for (let i = 0; i < body.operations.length; i++) {
      const op = body.operations[i];
      try {
        acc = applyOp(acc, op);
      } catch (err) {
        throw new ParserExecutionError(
          `op[${i}] (${(op).op}): ${(err as Error).message}`,
          i,
          op,
        );
      }
    }
    return acc;
  },
});

export type { ParserOperation, DeclarativeBody };
