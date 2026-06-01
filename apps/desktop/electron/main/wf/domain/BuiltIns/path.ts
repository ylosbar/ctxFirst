import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

export const pathType = {
  kind: "Path",
  name: "Path",
  description: "Filesystem path.",
  parent: null,
  schema: z.object({ path: z.string().min(1) }),
} as const satisfies BuiltinTypeDef;
