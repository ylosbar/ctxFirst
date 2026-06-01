import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

/** Refinement of `String` — see {@link ./url} for the covariance contract. */
export const linearRefType = {
  kind: "LinearRef",
  name: "LinearRef",
  description: "Linear issue reference.",
  parent: "String",
  schema: z.object({ value: z.string().regex(/^[A-Z]+-\d+$/) }),
} as const satisfies BuiltinTypeDef;
