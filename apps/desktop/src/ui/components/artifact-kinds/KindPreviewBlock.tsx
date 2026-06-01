/**
 * Lookup + composition wrapper around `KindPreview`. Given a bare
 * `ArtifactKind`, walks the `useArtifactSchemas()` snapshot to find the
 * matching `ArtifactSchemaView`, computes the shape projection, derives the
 * sample (explicit or auto-derived), and resolves the `extends` chain.
 *
 * Parametric kinds (`List<T>`, `OneOf<…>`, `Success<T>`, `Error<T>`) are not
 * stored by the registry — we synthesise their shape locally from the inner
 * kinds so the preview stays useful in the picker even though
 * `useArtifactSchemas()` does not list them.
 */
import { useMemo } from "react";

import { deriveKindSample } from "@shared/wf/derive-kind-sample";
import {
  isContainerArtifactKind,
  isErrorArtifactKind,
  isSuccessArtifactKind,
  isSumArtifactKind,
  parseErrorArtifactKind,
  parseListArtifactKind,
  parseSuccessArtifactKind,
  parseSumArtifactKind,
} from "@shared/wf/artifact-kind-grammar";
import { simplifiedSchemaToShapeText } from "@shared/wf/simplified-schema-to-shape-text";

import {
  kindForArtifactSchema,
  type ArtifactKind,
  type ArtifactSchemaView,
} from "../../../domain/workflow/types";
import useArtifactSchemas from "../../hooks/useArtifactSchemas";
import KindPreview from "./KindPreview";

type Props = {
  readonly kind: ArtifactKind;
  readonly className?: string;
};

/** Caps the refinement walk so a corrupted registry can't infinite-loop. */
const MAX_EXTENDS_DEPTH = 5;

const buildExtendsChain = (
  start: ArtifactSchemaView | null,
  schemasByKind: ReadonlyMap<string, ArtifactSchemaView>,
): ReadonlyArray<ArtifactKind> => {
  const chain: ArtifactKind[] = [];
  let current = start;
  for (let depth = 0; depth < MAX_EXTENDS_DEPTH; depth++) {
    const parent = current?.extends ?? null;
    if (!parent) break;
    chain.push(parent);
    current = schemasByKind.get(parent) ?? null;
    if (!current) break;
  }
  return chain;
};

type Composed = {
  shapeText: string;
  sample: unknown | null;
  sampleAutoDerived: boolean;
  view: ArtifactSchemaView | null;
  extendsChain: ReadonlyArray<ArtifactKind>;
};

const composeForBareKind = (
  kind: ArtifactKind,
  schemasByKind: ReadonlyMap<string, ArtifactSchemaView>,
): Composed => {
  const view = schemasByKind.get(kind) ?? null;
  if (!view) {
    return {
      shapeText: kind,
      sample: null,
      sampleAutoDerived: false,
      view: null,
      extendsChain: [],
    };
  }
  // The shape projection's resolver gets one chance to inline a `$kind` ref
  // back to a sub-shape before short-circuiting to the bare kind name. Lets
  // a `Url` (extends `String`) read as `string /* url */` instead of `Url`.
  const resolver = (k: string): string | null => {
    const inner = schemasByKind.get(k);
    if (!inner) return null;
    return simplifiedSchemaToShapeText(inner.simplifiedSchema, {
      resolve: () => null,
    });
  };
  const shapeText = simplifiedSchemaToShapeText(view.simplifiedSchema, {
    resolve: resolver,
  });
  const sampleAutoDerived = view.sample === null;
  const sample = sampleAutoDerived
    ? deriveKindSample(view.simplifiedSchema)
    : view.sample;
  return {
    shapeText,
    sample: sample ?? null,
    sampleAutoDerived,
    view,
    extendsChain: buildExtendsChain(view, schemasByKind),
  };
};

const composeForListKind = (
  kind: ArtifactKind,
  schemasByKind: ReadonlyMap<string, ArtifactSchemaView>,
): Composed => {
  const innerKind = parseListArtifactKind(kind) as ArtifactKind | null;
  if (!innerKind) {
    return {
      shapeText: kind,
      sample: null,
      sampleAutoDerived: false,
      view: null,
      extendsChain: [],
    };
  }
  const inner = composeForBareKind(innerKind, schemasByKind);
  if (!inner.view) {
    return {
      shapeText: `${innerKind}[]`,
      sample: null,
      sampleAutoDerived: false,
      view: null,
      extendsChain: [],
    };
  }
  // Synthetic `view` exposing the parametric description; KindPreview uses it
  // for the title / source badge.
  const view: ArtifactSchemaView = {
    id: kind,
    version: "v1",
    name: `List<${inner.view.name}>`,
    description: `Liste de ${inner.view.name}.`,
    rawSchema: null,
    simplifiedSchema: {},
    sampleRaw: null,
    sample: null,
    source: inner.view.source,
    extends: null,
    structuralHash: "",
    markdownTemplate: null,
  };
  return {
    shapeText: `{ items: ${inner.shapeText}[] }`,
    sample:
      inner.sample !== null
        ? { items: [inner.sample] }
        : null,
    sampleAutoDerived: inner.sampleAutoDerived,
    view,
    extendsChain: [],
  };
};

const composeForSumKind = (
  kind: ArtifactKind,
  schemasByKind: ReadonlyMap<string, ArtifactSchemaView>,
): Composed => {
  const variants = parseSumArtifactKind(kind);
  if (!variants) {
    return {
      shapeText: kind,
      sample: null,
      sampleAutoDerived: false,
      view: null,
      extendsChain: [],
    };
  }
  const composedVariants = variants.map((v) =>
    composeForBareKind(v as ArtifactKind, schemasByKind),
  );
  const shapeText = composedVariants.map((v) => v.shapeText).join(" | ");
  const firstWithSample = composedVariants.find((v) => v.sample !== null);
  const view: ArtifactSchemaView = {
    id: kind,
    version: "v1",
    name: `OneOf<${composedVariants
      .map((v) => v.view?.name ?? "?")
      .join(", ")}>`,
    description: `Union de ${variants.length} variantes.`,
    rawSchema: null,
    simplifiedSchema: {},
    sampleRaw: null,
    sample: null,
    source: { kind: "builtin" },
    extends: null,
    structuralHash: "",
    markdownTemplate: null,
  };
  return {
    shapeText,
    sample: firstWithSample?.sample ?? null,
    sampleAutoDerived: firstWithSample?.sampleAutoDerived ?? false,
    view,
    extendsChain: [],
  };
};

const composeForWrapperKind = (
  kind: ArtifactKind,
  schemasByKind: ReadonlyMap<string, ArtifactSchemaView>,
  variantTag: "Success" | "Error",
): Composed => {
  const innerKind = (
    variantTag === "Success"
      ? parseSuccessArtifactKind(kind)
      : parseErrorArtifactKind(kind)
  ) as ArtifactKind | null;
  if (!innerKind) {
    return {
      shapeText: kind,
      sample: null,
      sampleAutoDerived: false,
      view: null,
      extendsChain: [],
    };
  }
  const inner = composeForBareKind(innerKind, schemasByKind);
  if (!inner.view) {
    return {
      shapeText: kind,
      sample: null,
      sampleAutoDerived: false,
      view: null,
      extendsChain: [],
    };
  }
  const view: ArtifactSchemaView = {
    id: kind,
    version: "v1",
    name: `${variantTag}<${inner.view.name}>`,
    description:
      variantTag === "Success"
        ? `Succès enveloppant ${inner.view.name}.`
        : `Erreur enveloppant ${inner.view.name}.`,
    rawSchema: null,
    simplifiedSchema: {},
    sampleRaw: null,
    sample: null,
    source: inner.view.source,
    extends: null,
    structuralHash: "",
    markdownTemplate: null,
  };
  return {
    shapeText: `{ variant: "${variantTag}", value: ${inner.shapeText} }`,
    sample:
      inner.sample !== null
        ? { variant: variantTag, value: inner.sample }
        : null,
    sampleAutoDerived: inner.sampleAutoDerived,
    view,
    extendsChain: [],
  };
};

const composeForKind = (
  kind: ArtifactKind,
  schemasByKind: ReadonlyMap<string, ArtifactSchemaView>,
): Composed => {
  if (isContainerArtifactKind(kind)) {
    return composeForListKind(kind, schemasByKind);
  }
  if (isSumArtifactKind(kind)) {
    return composeForSumKind(kind, schemasByKind);
  }
  if (isSuccessArtifactKind(kind)) {
    return composeForWrapperKind(kind, schemasByKind, "Success");
  }
  if (isErrorArtifactKind(kind)) {
    return composeForWrapperKind(kind, schemasByKind, "Error");
  }
  return composeForBareKind(kind, schemasByKind);
};

const KindPreviewBlock = ({ kind, className }: Props) => {
  const { types } = useArtifactSchemas();

  const composed = useMemo(() => {
    const schemasByKind = new Map<string, ArtifactSchemaView>();
    for (const t of types) schemasByKind.set(kindForArtifactSchema(t), t);
    return composeForKind(kind, schemasByKind);
  }, [kind, types]);

  return (
    <KindPreview
      kind={kind}
      view={composed.view}
      shapeText={composed.shapeText}
      sample={composed.sample}
      sampleAutoDerived={composed.sampleAutoDerived}
      extendsChain={composed.extendsChain}
      className={className}
    />
  );
};

export default KindPreviewBlock;
