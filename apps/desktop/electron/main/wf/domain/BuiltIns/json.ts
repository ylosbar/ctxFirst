import type { BuiltinTypeDef } from "./def";
import { TextEnvelope } from "./text-envelope";

export const jsonType = {
  kind: "Json",
  name: "JSON",
  description: "JSON body.",
  parent: null,
  schema: TextEnvelope(["json"] as const),
} as const satisfies BuiltinTypeDef;
