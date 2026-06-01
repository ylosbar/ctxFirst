import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

export const booleanType = {
  kind: "Boolean",
  name: "Boolean",
  description: "Boolean value.",
  parent: null,
  schema: z.object({ value: z.boolean() }),
} as const satisfies BuiltinTypeDef;
