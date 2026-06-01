import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

/**
 * Refinement of `String` — a `String` payload with a narrower validator on
 * `value`. The picker, the runtime parser, and `portAccepts` treat it as a
 * covariant subtype via `parent: "String"`.
 */
export const urlType = {
  kind: "Url",
  name: "URL",
  description: "Validated URL.",
  parent: "String",
  schema: z.object({ value: z.string().url() }),
} as const satisfies BuiltinTypeDef;
