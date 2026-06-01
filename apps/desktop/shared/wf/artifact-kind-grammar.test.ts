import { describe, expect, it } from "vitest";

import {
  canonicalisedFromLegacyList,
  isContainerArtifactKind,
  isErrorArtifactKind,
  isSuccessArtifactKind,
  isSumArtifactKind,
  MAX_KIND_DEPTH,
  MAX_SUM_VARIANTS,
  parseErrorArtifactKind,
  parseListArtifactKind,
  parseSuccessArtifactKind,
  parseSumArtifactKind,
} from "./artifact-kind-grammar";

describe("isContainerArtifactKind", () => {
  it("recognises a `List<…>` encoding", () => {
    expect(isContainerArtifactKind("List<Markdown>")).toBe(true);
    expect(isContainerArtifactKind("List<plugin:linear:Ticket@v1>")).toBe(true);
    expect(isContainerArtifactKind("List<List<Path>>")).toBe(true);
  });

  it("rejects non-container kinds", () => {
    expect(isContainerArtifactKind("Markdown")).toBe(false);
    expect(isContainerArtifactKind("MarkdownList")).toBe(false);
    expect(isContainerArtifactKind("user:foo@v1")).toBe(false);
    expect(isContainerArtifactKind("")).toBe(false);
  });
});

describe("parseListArtifactKind", () => {
  it("extracts the inner kind", () => {
    expect(parseListArtifactKind("List<Markdown>")).toBe("Markdown");
    expect(parseListArtifactKind("List<Path>")).toBe("Path");
    expect(parseListArtifactKind("List<plugin:linear:Ticket@v1>")).toBe(
      "plugin:linear:Ticket@v1",
    );
  });

  it("supports nested lists", () => {
    expect(parseListArtifactKind("List<List<Path>>")).toBe("List<Path>");
    expect(parseListArtifactKind("List<List<List<Markdown>>>")).toBe(
      "List<List<Markdown>>",
    );
  });

  it("returns null for non-list kinds", () => {
    expect(parseListArtifactKind("Markdown")).toBeNull();
    expect(parseListArtifactKind("MarkdownList")).toBeNull();
  });

  it("returns null for malformed encodings", () => {
    expect(parseListArtifactKind("List<")).toBeNull();
    expect(parseListArtifactKind("List<>")).toBeNull();
    expect(parseListArtifactKind("List<Markdown")).toBeNull();
    expect(parseListArtifactKind("List<Mark<down>")).toBeNull();
    expect(parseListArtifactKind("List<<Markdown>")).toBeNull();
  });

  it(`enforces the MAX_KIND_DEPTH=${MAX_KIND_DEPTH} cap`, () => {
    // 4 levels of nesting = depth 4, accepted.
    expect(parseListArtifactKind("List<List<List<List<Path>>>>")).toBe(
      "List<List<List<Path>>>",
    );
    // 5 levels of nesting = depth 5, rejected.
    expect(parseListArtifactKind("List<List<List<List<List<Path>>>>>")).toBeNull();
  });
});

describe("isSumArtifactKind", () => {
  it("recognises a OneOf<…> encoding", () => {
    expect(isSumArtifactKind("OneOf<Markdown,Path>")).toBe(true);
    expect(isSumArtifactKind("OneOf<Markdown,List<Path>,Json>")).toBe(true);
  });

  it("rejects non-sum kinds", () => {
    expect(isSumArtifactKind("Markdown")).toBe(false);
    expect(isSumArtifactKind("List<Markdown>")).toBe(false);
    expect(isSumArtifactKind("Success<Markdown>")).toBe(false);
  });
});

describe("parseSumArtifactKind", () => {
  it("splits variants at top-level commas", () => {
    expect(parseSumArtifactKind("OneOf<Markdown,Path>")).toEqual([
      "Markdown",
      "Path",
    ]);
    expect(parseSumArtifactKind("OneOf<A,B,C>")).toEqual(["A", "B", "C"]);
  });

  it("respects nested chevrons (no split inside)", () => {
    expect(parseSumArtifactKind("OneOf<List<Markdown>,Path>")).toEqual([
      "List<Markdown>",
      "Path",
    ]);
    expect(
      parseSumArtifactKind("OneOf<Success<Markdown>,Error<Markdown>>"),
    ).toEqual(["Success<Markdown>", "Error<Markdown>"]);
  });

  it("returns null for malformed encodings", () => {
    expect(parseSumArtifactKind("OneOf<>")).toBeNull();
    expect(parseSumArtifactKind("OneOf<Markdown>")).toBeNull(); // < 2 variants
    expect(parseSumArtifactKind("OneOf<Markdown,>")).toBeNull(); // trailing empty
    expect(parseSumArtifactKind("OneOf<,Markdown>")).toBeNull(); // leading empty
    expect(parseSumArtifactKind("OneOf<A,B")).toBeNull(); // missing >
    expect(parseSumArtifactKind("OneOf<A,B>>")).toBeNull(); // unbalanced
  });

  it("rejects duplicate variants", () => {
    expect(parseSumArtifactKind("OneOf<A,A>")).toBeNull();
    expect(parseSumArtifactKind("OneOf<Markdown,Path,Markdown>")).toBeNull();
  });

  it(`enforces MAX_SUM_VARIANTS=${MAX_SUM_VARIANTS}`, () => {
    const variants = Array.from({ length: MAX_SUM_VARIANTS }, (_, i) => `K${i}`);
    expect(parseSumArtifactKind(`OneOf<${variants.join(",")}>`)).toEqual(
      variants,
    );
    const overCap = [...variants, "Overflow"];
    expect(parseSumArtifactKind(`OneOf<${overCap.join(",")}>`)).toBeNull();
  });

  it(`enforces MAX_KIND_DEPTH=${MAX_KIND_DEPTH} on nested variants`, () => {
    // OneOf<...> at depth 1, List<List<List<Path>>> at depth 4 → total = 4. OK.
    expect(
      parseSumArtifactKind("OneOf<Markdown,List<List<List<Path>>>>"),
    ).toEqual(["Markdown", "List<List<List<Path>>>"]);
    // One more level → exceeds.
    expect(
      parseSumArtifactKind("OneOf<Markdown,List<List<List<List<Path>>>>>"),
    ).toBeNull();
  });
});

describe("Success<T> / Error<E>", () => {
  it("recognises both encodings", () => {
    expect(isSuccessArtifactKind("Success<Markdown>")).toBe(true);
    expect(isErrorArtifactKind("Error<Markdown>")).toBe(true);
    expect(isSuccessArtifactKind("Error<Markdown>")).toBe(false);
    expect(isErrorArtifactKind("Success<Markdown>")).toBe(false);
  });

  it("extracts the inner kind", () => {
    expect(parseSuccessArtifactKind("Success<Markdown>")).toBe("Markdown");
    expect(parseErrorArtifactKind("Error<List<Path>>")).toBe("List<Path>");
  });

  it("returns null for malformed encodings", () => {
    expect(parseSuccessArtifactKind("Success<>")).toBeNull();
    expect(parseSuccessArtifactKind("Success<Markdown")).toBeNull();
    expect(parseErrorArtifactKind("Error<<Markdown>")).toBeNull();
  });
});

describe("canonicalisedFromLegacyList", () => {
  it("collapses MarkdownList → List<Markdown>", () => {
    expect(canonicalisedFromLegacyList("MarkdownList")).toBe("List<Markdown>");
  });

  it("collapses PathList → List<Path>", () => {
    expect(canonicalisedFromLegacyList("PathList")).toBe("List<Path>");
  });

  it("returns null for non-legacy kinds", () => {
    expect(canonicalisedFromLegacyList("Markdown")).toBeNull();
    expect(canonicalisedFromLegacyList("List<Markdown>")).toBeNull();
    expect(canonicalisedFromLegacyList("user:foo@v1")).toBeNull();
  });
});
