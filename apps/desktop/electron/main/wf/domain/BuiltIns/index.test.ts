import { describe, expect, it } from "vitest";

import type { BuiltinArtifactKind } from "../artifact";
import { BUILTIN_SAMPLES, BUILTIN_SCHEMAS, BUILTIN_DESCRIPTORS } from "./index";

describe("BUILTIN_SAMPLES", () => {
  it("provides one sample per BUILTIN_SCHEMAS entry", () => {
    const schemaKinds = Object.keys(BUILTIN_SCHEMAS).sort();
    const sampleKinds = Object.keys(BUILTIN_SAMPLES).sort();
    expect(sampleKinds).toEqual(schemaKinds);
  });

  it("each sample parses against its compiled schema", () => {
    for (const kind of Object.keys(BUILTIN_SAMPLES) as BuiltinArtifactKind[]) {
      const schema = BUILTIN_SCHEMAS[kind];
      const sample = BUILTIN_SAMPLES[kind];
      const result = schema.safeParse(sample);
      // Surface the kind on failure so it's obvious which seed is broken.
      if (!result.success) {
        throw new Error(
          `BUILTIN_SAMPLES["${kind}"] does not parse: ${JSON.stringify(
            result.error.format(),
            null,
            2,
          )}`,
        );
      }
    }
  });

  it("descriptors expose the seeded sample", () => {
    for (const descriptor of BUILTIN_DESCRIPTORS) {
      expect(descriptor.sample).toEqual(
        BUILTIN_SAMPLES[descriptor.kind as BuiltinArtifactKind],
      );
    }
  });
});
