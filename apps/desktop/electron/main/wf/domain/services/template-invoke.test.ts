import { describe, expect, it } from "vitest";
import {
  hasTemplateInvoke,
  isTemplateInvoke,
  MAX_INVOCATION_DEPTH,
  readTemplateInvokeRef,
  TEMPLATE_INVOKE_KIND,
  TemplateInvokeError,
  templateInvokeRefKey,
} from "./template-invoke";
import { asTemplateId, asTemplateVersion } from "../ids";
import { buildTemplate } from "../../__tests__/fixtures/builders";

describe("template-invoke constants (Phase A anchor)", () => {
  it("pins the kind discriminator and the depth bound", () => {
    expect(TEMPLATE_INVOKE_KIND).toBe("template.invoke");
    expect(MAX_INVOCATION_DEPTH).toBe(8);
  });

  it("isTemplateInvoke detects the kind", () => {
    const tpl = buildTemplate(
      "t",
      [
        { id: "a", kind: "user.input" },
        { id: "b", kind: "template.invoke" },
      ],
      [{ from: "a", to: "b" }],
    );
    const [a, b] = tpl.steps;
    expect(isTemplateInvoke(a)).toBe(false);
    expect(isTemplateInvoke(b)).toBe(true);
  });

  it("hasTemplateInvoke is false for an ordinary template, true when one is present", () => {
    const plain = buildTemplate("plain", [{ id: "a", kind: "user.input" }], []);
    expect(hasTemplateInvoke(plain)).toBe(false);

    const withInvoke = buildTemplate(
      "with",
      [
        { id: "a", kind: "user.input" },
        { id: "b", kind: "template.invoke" },
      ],
      [{ from: "a", to: "b" }],
    );
    expect(hasTemplateInvoke(withInvoke)).toBe(true);
  });
});

describe("readTemplateInvokeRef", () => {
  it("reads the literal { templateId, templateVersion } config", () => {
    const tpl = buildTemplate(
      "t",
      [
        {
          id: "a",
          kind: "template.invoke",
          config: { templateId: "child", templateVersion: "v1" },
        },
      ],
      [],
    );
    expect(readTemplateInvokeRef(tpl.steps[0])).toEqual({
      templateId: asTemplateId("child"),
      templateVersion: asTemplateVersion("v1"),
    });
  });

  it("throws when the ref config is missing or non-literal", () => {
    const tpl = buildTemplate(
      "t",
      [{ id: "a", kind: "template.invoke", config: { templateId: "child" } }],
      [],
    );
    expect(() => readTemplateInvokeRef(tpl.steps[0])).toThrow(TemplateInvokeError);
  });

  it("templateInvokeRefKey is the canonical id@version", () => {
    expect(
      templateInvokeRefKey({
        templateId: asTemplateId("child"),
        templateVersion: asTemplateVersion("v2"),
      }),
    ).toBe("child@v2");
  });
});
