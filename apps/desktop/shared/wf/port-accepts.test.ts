import { describe, expect, it } from "vitest";

import {
  portAccepts,
  type RefinementParentResolver,
} from "./port-accepts";
import { WILDCARD_KIND } from "./types";

describe("portAccepts — base behaviour", () => {
  it("accepts a direct kind match", () => {
    expect(portAccepts({ kinds: ["Markdown"] }, "Markdown")).toBe(true);
  });

  it("accepts anything on a wildcard port", () => {
    expect(portAccepts({ kinds: [WILDCARD_KIND] }, "anything-goes")).toBe(true);
  });

  it("rejects unrelated kinds", () => {
    expect(portAccepts({ kinds: ["Markdown"] }, "Path")).toBe(false);
    expect(portAccepts({ kinds: [] }, "Markdown")).toBe(false);
  });
});

describe("portAccepts — List<T> covariance", () => {
  it("flows `List<Markdown>` into a `List<Markdown>` port", () => {
    expect(
      portAccepts({ kinds: ["List<Markdown>"] }, "List<Markdown>"),
    ).toBe(true);
  });

  it("refuses `List<Markdown>` on a `List<Path>` port", () => {
    expect(portAccepts({ kinds: ["List<Path>"] }, "List<Markdown>")).toBe(
      false,
    );
  });

  it("refuses heterogeneous inner kinds (no implicit upcast across types)", () => {
    expect(
      portAccepts(
        { kinds: ["List<Markdown>"] },
        "List<plugin:linear:Ticket@v1>",
      ),
    ).toBe(false);
  });

  it("supports nested lists", () => {
    expect(
      portAccepts({ kinds: ["List<List<Path>>"] }, "List<List<Path>>"),
    ).toBe(true);
    expect(
      portAccepts({ kinds: ["List<List<Path>>"] }, "List<Path>"),
    ).toBe(false);
  });
});

describe("portAccepts — OneOf<...>", () => {
  it("élargissement: producer A on port OneOf<A,B>", () => {
    expect(
      portAccepts({ kinds: ["OneOf<Markdown,LinearRef>"] }, "Markdown"),
    ).toBe(true);
    expect(
      portAccepts({ kinds: ["OneOf<Markdown,LinearRef>"] }, "LinearRef"),
    ).toBe(true);
  });

  it("refuses producer kind not in any variant", () => {
    expect(portAccepts({ kinds: ["OneOf<Markdown,LinearRef>"] }, "Path")).toBe(
      false,
    );
  });

  it("sous-ensemble: producer OneOf<A> on port OneOf<A,B>", () => {
    // `OneOf<A>` is invalid (< 2 variants), so subset-tests use 2-vs-3.
    expect(
      portAccepts(
        { kinds: ["OneOf<Markdown,LinearRef,Path>"] },
        "OneOf<Markdown,LinearRef>",
      ),
    ).toBe(true);
  });

  it("refuses sum superset on smaller sum port", () => {
    expect(
      portAccepts(
        { kinds: ["OneOf<Markdown,LinearRef>"] },
        "OneOf<Markdown,LinearRef,Path>",
      ),
    ).toBe(false);
  });

  it("refuses extracting a variant: producer OneOf<A,B> on port A", () => {
    expect(
      portAccepts({ kinds: ["Markdown"] }, "OneOf<Markdown,LinearRef>"),
    ).toBe(false);
  });

  it("supports nested sums of List variants", () => {
    expect(
      portAccepts(
        { kinds: ["OneOf<List<Markdown>,LinearRef>"] },
        "List<Markdown>",
      ),
    ).toBe(true);
  });

  it("Success<T> and Error<E> kept distinct under a sum", () => {
    expect(
      portAccepts(
        { kinds: ["OneOf<Success<Markdown>,Error<Markdown>>"] },
        "Success<Markdown>",
      ),
    ).toBe(true);
    // Producer Markdown does not match either variant (wrappers ≠ bare kind).
    expect(
      portAccepts(
        { kinds: ["OneOf<Success<Markdown>,Error<Markdown>>"] },
        "Markdown",
      ),
    ).toBe(false);
  });
});

describe("portAccepts — legacy MarkdownList ≡ List<Markdown> alias", () => {
  it("accepts `MarkdownList` on a `List<Markdown>` port", () => {
    expect(portAccepts({ kinds: ["List<Markdown>"] }, "MarkdownList")).toBe(
      true,
    );
  });

  it("accepts `List<Markdown>` on a legacy `MarkdownList` port", () => {
    expect(portAccepts({ kinds: ["MarkdownList"] }, "List<Markdown>")).toBe(
      true,
    );
  });

  it("accepts `PathList` on a `List<Path>` port", () => {
    expect(portAccepts({ kinds: ["List<Path>"] }, "PathList")).toBe(true);
  });

  it("accepts `List<Path>` on a legacy `PathList` port", () => {
    expect(portAccepts({ kinds: ["PathList"] }, "List<Path>")).toBe(true);
  });

  it("does not cross-link MarkdownList and PathList", () => {
    expect(portAccepts({ kinds: ["MarkdownList"] }, "List<Path>")).toBe(false);
    expect(portAccepts({ kinds: ["PathList"] }, "List<Markdown>")).toBe(false);
  });
});

describe("portAccepts — refinement covariance (§2)", () => {
  // Mini-registry mirroring the §2 String hierarchy: Url and Email refine
  // String, MyRef chains MyRef → Url → String. LinearRef refines String too,
  // and is unrelated to Url/Email at the same depth.
  const resolver: RefinementParentResolver = (kind) => {
    switch (kind) {
      case "String":
        return { extends: null };
      case "Url":
        return { extends: "String" };
      case "Email":
        return { extends: "String" };
      case "LinearRef":
        return { extends: "String" };
      case "user:my-ref@v1":
        return { extends: "Url" };
      case "Markdown":
        return { extends: null };
      default:
        return null;
    }
  };

  it("accepts a refinement on a port typed as its super-type", () => {
    expect(portAccepts({ kinds: ["String"] }, "Url", resolver)).toBe(true);
    expect(portAccepts({ kinds: ["String"] }, "Email", resolver)).toBe(true);
    expect(portAccepts({ kinds: ["String"] }, "LinearRef", resolver)).toBe(true);
  });

  it("refuses the super-type on a port typed as the refinement", () => {
    expect(portAccepts({ kinds: ["Url"] }, "String", resolver)).toBe(false);
    expect(portAccepts({ kinds: ["LinearRef"] }, "String", resolver)).toBe(
      false,
    );
  });

  it("walks the multi-level refinement chain", () => {
    expect(portAccepts({ kinds: ["String"] }, "user:my-ref@v1", resolver)).toBe(
      true,
    );
    expect(portAccepts({ kinds: ["Url"] }, "user:my-ref@v1", resolver)).toBe(
      true,
    );
  });

  it("does not cross-link sibling refinements", () => {
    expect(portAccepts({ kinds: ["Url"] }, "Email", resolver)).toBe(false);
    expect(portAccepts({ kinds: ["Email"] }, "LinearRef", resolver)).toBe(false);
  });

  it("refuses without a resolver (legacy callers stay strict)", () => {
    expect(portAccepts({ kinds: ["String"] }, "Url")).toBe(false);
  });

  it("survives a corrupted chain without infinite looping", () => {
    // Deliberately cyclic mini-registry: a → b → a. The walk's `seen` guard
    // must terminate without throwing.
    const cycle: RefinementParentResolver = (k) =>
      k === "a"
        ? { extends: "b" }
        : k === "b"
          ? { extends: "a" }
          : null;
    expect(portAccepts({ kinds: ["c"] }, "a", cycle)).toBe(false);
  });

  it("composes with list covariance — `List<Url>` flows into `List<String>`", () => {
    expect(
      portAccepts({ kinds: ["List<String>"] }, "List<Url>", resolver),
    ).toBe(true);
  });
});

describe("portAccepts — content-addressed equality (§5)", () => {
  // Mini-registry where a user record and a plugin record happen to publish
  // exactly the same structure — their hashes match, so they are
  // interchangeable.
  const hashResolver: RefinementParentResolver = (kind) => {
    switch (kind) {
      case "Markdown":
        return { extends: null, structuralHash: "h-markdown" };
      case "user:ticket@v1":
      case "plugin:linear:Ticket@v1":
        // Same structural fingerprint despite distinct names + sources.
        return { extends: null, structuralHash: "h-ticket" };
      case "user:other@v1":
        return { extends: null, structuralHash: "h-other" };
      default:
        return null;
    }
  };

  it("accepts a producer whose hash matches one of the port's kinds", () => {
    expect(
      portAccepts(
        { kinds: ["plugin:linear:Ticket@v1"] },
        "user:ticket@v1",
        hashResolver,
      ),
    ).toBe(true);
  });

  it("accepts in reverse — user port, plugin producer", () => {
    expect(
      portAccepts(
        { kinds: ["user:ticket@v1"] },
        "plugin:linear:Ticket@v1",
        hashResolver,
      ),
    ).toBe(true);
  });

  it("refuses when hashes differ", () => {
    expect(
      portAccepts(
        { kinds: ["user:ticket@v1"] },
        "user:other@v1",
        hashResolver,
      ),
    ).toBe(false);
  });

  it("skipped silently when the resolver doesn't expose a hash", () => {
    const noHashResolver: RefinementParentResolver = (kind) =>
      kind === "user:a@v1" || kind === "user:b@v1"
        ? { extends: null }
        : null;
    expect(
      portAccepts({ kinds: ["user:a@v1"] }, "user:b@v1", noHashResolver),
    ).toBe(false);
  });
});
