import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

/** Refinement of `String` — see {@link ./url} for the covariance contract. */
export const emailType = {
  kind: "Email",
  name: "Email",
  description: "Validated email address.",
  parent: "String",
  schema: z.object({ value: z.string().email() }),
} as const satisfies BuiltinTypeDef;
