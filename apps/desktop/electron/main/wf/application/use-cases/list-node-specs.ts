import type { StepRunnerRegistry } from "../step-runner";
import type { StepKindId } from "../../domain/template";

export type NodeSpecView = {
  kind: StepKindId;
  title: string;
  description?: string;
  inputs: ReadonlyArray<{
    name: string;
    kinds: ReadonlyArray<string>;
    optional?: boolean;
    isList?: boolean;
    primary?: boolean;
  }>;
  outputs: ReadonlyArray<{
    name: string;
    kind: string;
    description?: string;
    primary?: boolean;
  }>;
  passthrough?: boolean;
};

type Deps = { runners: StepRunnerRegistry };

export type ListNodeSpecs = () => Promise<ReadonlyArray<NodeSpecView>>;

export const makeListNodeSpecs =
  ({ runners }: Deps): ListNodeSpecs =>
  async () => {
    const kinds = runners.listKinds();
    return kinds.map((kind): NodeSpecView => {
      const runner = runners.resolve(kind);
      try {
        // Catalogue mode: no template context. Template-aware runners fall
        // back to a permissive spec when they would otherwise need it.
        const spec = runner.resolveSpec({ config: {} });
        return {
          kind,
          title: spec.title,
          description: spec.description,
          inputs: spec.inputs.map((p) => ({
            name: p.name,
            kinds: [...p.kinds],
            optional: p.optional,
            isList: p.isList,
            primary: p.primary,
          })),
          outputs: spec.outputs.map((o) => ({
            name: o.name,
            kind: o.kind,
            description: o.description,
            primary: o.primary,
          })),
          passthrough: spec.passthrough,
        };
      } catch {
        // Polymorphic runners throw when their config is incomplete (no
        // `outputKind` / `inputKind`). Fall back to a permissive template so
        // the picker can still surface the kind — per-step editing relies on
        // the step's own `config.outputKind`, not this list.
        return {
          kind,
          title: kind,
          inputs: [{ name: "input", kinds: ["*"], optional: true }],
          outputs: [{ name: "out", kind: "Markdown" }],
        };
      }
    });
  };
