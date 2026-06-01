import { ShieldCheck } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import { useArtifactSchemaEditorStore } from "../../stores/artifact-schema-editor-store";
import ArtifactSchemaEditor from "./ArtifactSchemaEditor";

const ARTIFACT_SCHEMA_URI_PREFIX = "artifact-schema://";
const NEW_TYPE_URI = "artifact-schema://new";

const tryParseJson = (text: string): unknown | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

workbenchRegistry.registerEditorType({
  id: "artifact-schemas.editor",
  scheme: "artifact-schema",
  title: (uri) => {
    if (uri === NEW_TYPE_URI) return "Nouveau type d'artifact";
    return uri.slice(ARTIFACT_SCHEMA_URI_PREFIX.length);
  },
  icon: () => ShieldCheck,
  iconClassName: "text-[var(--chart-2)]",
  render: ({ uri, api }) => createElement(ArtifactSchemaEditor, { uri, api }),
  getChatContext: (uri) => {
    const handle = useArtifactSchemaEditorStore.getState().handles.get(uri);
    if (!handle) return null;
    const ref =
      !handle.isNew && handle.id && handle.version
        ? { id: handle.id, version: handle.version }
        : null;
    const label = handle.isNew
      ? "Type d'artifact (brouillon)"
      : `Type d'artifact : ${handle.name || handle.id}@${handle.version}`;
    return {
      scope: `artifact-schema-editor://${uri}`,
      label,
      data: {
        ref,
        isNew: handle.isNew,
        dirty: handle.dirty,
        id: handle.id || null,
        version: handle.version || null,
        name: handle.name || null,
        description: handle.description || null,
        source: handle.source,
        simplifiedSchema: tryParseJson(handle.simplifiedSchemaText),
        rawSchema: tryParseJson(handle.rawSchemaText),
        hasSampleRaw: handle.sampleRaw.trim().length > 0,
      },
    };
  },
});
