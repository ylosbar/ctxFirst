import { z } from "zod";
import type { BuiltinTypeDef } from "./def";

export const markdownListType = {
  kind: "MarkdownList",
  name: "MarkdownList",
  description: "List of markdown bodies.",
  parent: null,
  schema: z.object({
    format: z.literal("markdown-list"),
    bodies: z.array(z.string()),
  }),
} as const satisfies BuiltinTypeDef;
