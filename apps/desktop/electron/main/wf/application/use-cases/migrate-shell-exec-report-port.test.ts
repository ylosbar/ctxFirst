import { describe, expect, it } from "vitest";
import { migrateShellExecReportPort } from "./migrate-shell-exec-report-port";
import { buildTemplate } from "../../__tests__/fixtures/builders";

const fromPortsTo = (
  tpl: ReturnType<typeof buildTemplate>,
  to: string,
): string[] =>
  tpl.transitions
    .filter((t) => t.to === to)
    .map((t) => t.fromPort ?? "")
    .sort();

describe("migrateShellExecReportPort", () => {
  it("is a no-op for templates without a shell.exec step", () => {
    const tpl = buildTemplate(
      "modern",
      [
        { id: "a", kind: "user.input" },
        { id: "b", kind: "human.gate", humanGateRequired: true },
      ],
      [{ from: "a", to: "b" }],
    );
    const result = migrateShellExecReportPort(tpl);
    expect(result.changed).toBe(false);
    expect(result.template).toBe(tpl);
  });

  it("rewrites a `report` edge into success + failure edges", () => {
    const tpl = buildTemplate(
      "legacy",
      [
        { id: "sh", kind: "shell.exec" },
        { id: "next", kind: "human.gate", humanGateRequired: true },
      ],
      [{ from: "sh", to: "next", fromPort: "report" }],
    );
    const result = migrateShellExecReportPort(tpl);
    expect(result.changed).toBe(true);
    expect(fromPortsTo(result.template, "next")).toEqual(["failure", "success"]);
    expect(
      result.template.transitions.some((t) => t.fromPort === "report"),
    ).toBe(false);
  });

  it("rewrites a bare (no fromPort) shell.exec edge as well", () => {
    const tpl = buildTemplate(
      "legacy-bare",
      [
        { id: "sh", kind: "shell.exec" },
        { id: "next", kind: "human.gate", humanGateRequired: true },
      ],
      [{ from: "sh", to: "next" }],
    );
    const result = migrateShellExecReportPort(tpl);
    expect(result.changed).toBe(true);
    expect(fromPortsTo(result.template, "next")).toEqual(["failure", "success"]);
  });

  it("preserves the target port and order on both new edges", () => {
    const tpl = buildTemplate(
      "legacy-fields",
      [
        { id: "sh", kind: "shell.exec" },
        { id: "next", kind: "concat.markdown" },
      ],
      [{ from: "sh", to: "next", fromPort: "report", toPort: "parts", order: 3 }],
    );
    const { template } = migrateShellExecReportPort(tpl);
    const edges = template.transitions.filter((t) => t.to === "next");
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.toPort).toBe("parts");
      expect(e.order).toBe(3);
      expect(e.isLoop).toBe(false);
    }
  });

  it("leaves non-shell.exec edges untouched", () => {
    const tpl = buildTemplate(
      "mixed",
      [
        { id: "src", kind: "user.input" },
        { id: "sh", kind: "shell.exec" },
        { id: "next", kind: "human.gate", humanGateRequired: true },
      ],
      [
        { from: "src", to: "sh" },
        { from: "sh", to: "next", fromPort: "report" },
      ],
    );
    const { template } = migrateShellExecReportPort(tpl);
    // The user.input → shell.exec edge (bare, but not from a shell.exec) stays.
    expect(
      template.transitions.filter((t) => t.from === "src" && t.to === "sh"),
    ).toHaveLength(1);
  });

  it("is idempotent — a second pass makes no change", () => {
    const tpl = buildTemplate(
      "idempotent",
      [
        { id: "sh", kind: "shell.exec" },
        { id: "next", kind: "human.gate", humanGateRequired: true },
      ],
      [{ from: "sh", to: "next", fromPort: "report" }],
    );
    const once = migrateShellExecReportPort(tpl).template;
    const twice = migrateShellExecReportPort(once);
    expect(twice.changed).toBe(false);
    expect(fromPortsTo(twice.template, "next")).toEqual(["failure", "success"]);
  });
});
