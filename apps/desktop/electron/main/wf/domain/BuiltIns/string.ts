import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

/** Primitive root — `value`-shaped scalar. Refinements layer on via `parent`. */
export const stringType = {
  kind: "String",
  name: "String",
  description: "Plain string value.",
  parent: null,
  schema: z.object({ value: z.string() }),
} as const satisfies BuiltinTypeDef;
