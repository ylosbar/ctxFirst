import { Network } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import { useTemplateCanvasStore } from "../../stores/template-canvas-store";
import { i18n } from "../../i18n";
import TemplatesListEditor from "./TemplatesListEditor";
import TemplateEditor from "./TemplateEditor";
import {
  NEW_TEMPLATE_URI,
  refFromTemplateUri,
} from "./template-uri";

workbenchRegistry.registerEditorType({
  id: "templates.list",
  scheme: "templates",
  title: () => "Templates",
  icon: () => Network,
  iconClassName: "text-[var(--chart-4)]",
  singleton: true,
  render: ({ api }) => createElement(TemplatesListEditor, { api }),
});

workbenchRegistry.registerEditorType({
  id: "template.editor",
  scheme: "template",
  title: (uri) => {
    if (uri === NEW_TEMPLATE_URI || uri.startsWith(`${NEW_TEMPLATE_URI}?`)) {
      return i18n.t("template.untitled");
    }
    const ref = refFromTemplateUri(uri);
    return ref ?? "Template";
  },
  icon: () => Network,
  iconClassName: "text-[var(--chart-4)]",
  render: ({ uri, api }) => createElement(TemplateEditor, { uri, api }),
  getChatContext: (uri) => {
    // Read the in-memory canvas handle published by the open template editor.
    // When the editor hasn't mounted yet (URI in dockview but never activated)
    // we get nothing — return null and the chat will show "no view context".
    const handle = useTemplateCanvasStore.getState().handles.get(uri);
    if (!handle) return null;
    const ref = refFromTemplateUri(uri);
    const isNew = ref === null;
    const label = isNew
      ? "Template (brouillon)"
      : `Template: ${handle.templateId}@${handle.version}`;
    return {
      scope: `template-editor://${uri}`,
      label,
      data: {
        templateRef: isNew ? null : ref,
        templateId: handle.templateId,
        version: handle.version,
        name: handle.name,
        description: handle.description || null,
        stepCount: handle.steps.length,
        stepKinds: handle.steps.map((s) => s.kind),
        variableNames: handle.variables.map((v) => v.name),
        mutationEnabled: handle.mutationEnabled,
      },
    };
  },
});

