import { z } from "zod";

/**
 * `{ format, body }` envelope schema for opaque text artifacts with a declared
 * format. Shared by the `Markdown` and `Json` built-ins.
 */
export const TextEnvelope = <F extends readonly [string, ...string[]]>(
  formats: F,
) =>
  z.object({
    format: z.enum(formats),
    body: z.string().min(1),
  });
