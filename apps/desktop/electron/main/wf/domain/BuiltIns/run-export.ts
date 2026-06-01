import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

export const runExportType = {
  kind: "RunExport",
  name: "RunExport",
  description: "Export of a workflow run.",
  parent: null,
  schema: z.object({
    format: z.literal("json"),
    schemaVersion: z.literal(1),
    body: z.string().min(1),
  }),
} as const satisfies BuiltinTypeDef;
