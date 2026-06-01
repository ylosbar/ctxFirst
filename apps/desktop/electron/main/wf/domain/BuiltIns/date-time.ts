import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

/** Refinement of `String` — see {@link ./url} for the covariance contract. */
export const dateTimeType = {
  kind: "DateTime",
  name: "DateTime",
  description: "ISO 8601 timestamp.",
  parent: "String",
  schema: z.object({ value: z.string().datetime() }),
} as const satisfies BuiltinTypeDef;
