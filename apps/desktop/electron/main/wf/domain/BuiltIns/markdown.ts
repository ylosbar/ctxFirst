import type { BuiltinTypeDef } from "./def";
import { TextEnvelope } from "./text-envelope";

export const markdownType = {
  kind: "Markdown",
  name: "Markdown",
  description: "Markdown body.",
  parent: null,
  schema: TextEnvelope(["markdown"] as const),
} as const satisfies BuiltinTypeDef;
