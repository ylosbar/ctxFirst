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

describe("Markdown / Json empty-body rule", () => {
  // An empty Markdown document is the "omit this fragment" signal that
  // select.markdown emits (flag false) and concat.markdown skips. It must be
  // storable, so the Markdown envelope accepts an empty body.
  it("Markdown accepts an empty body", () => {
    expect(
      BUILTIN_SCHEMAS.Markdown.safeParse({ format: "markdown", body: "" })
        .success,
    ).toBe(true);
  });

  // Json stays strict: "" is not valid JSON.
  it("Json rejects an empty body", () => {
    expect(
      BUILTIN_SCHEMAS.Json.safeParse({ format: "json", body: "" }).success,
    ).toBe(false);
  });
});
