import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

export const numberType = {
  kind: "Number",
  name: "Number",
  description: "Numeric value.",
  parent: null,
  schema: z.object({ value: z.number() }),
} as const satisfies BuiltinTypeDef;
