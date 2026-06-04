import { z } from "zod";

/**
 * `{ format, body }` envelope schema for opaque text artifacts with a declared
 * format. Shared by the `Markdown` and `Json` built-ins.
 *
 * `allowEmpty` (default `false`) keeps the strict `body >= 1 char` rule for
 * formats where an empty body is meaningless (e.g. `Json` — `""` is not valid
 * JSON). `Markdown` opts in: an empty Markdown document is legitimate and is
 * the "omit this fragment" signal relied on by `select.markdown` /
 * `concat.markdown` (an empty fragment must be storable, then skipped on concat).
 */
export const TextEnvelope = <F extends readonly [string, ...string[]]>(
  formats: F,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
) =>
  z.object({
    format: z.enum(formats),
    body: allowEmpty ? z.string() : z.string().min(1),
  });
