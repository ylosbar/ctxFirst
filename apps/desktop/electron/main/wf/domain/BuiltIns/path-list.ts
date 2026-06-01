import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

export const pathListType = {
  kind: "PathList",
  name: "PathList",
  description: "List of filesystem paths.",
  parent: null,
  schema: z.object({
    format: z.literal("path-list"),
    paths: z.array(z.string().min(1)),
  }),
} as const satisfies BuiltinTypeDef;
