import { Variable } from "lucide-react";
import { createElement } from "react";
import { workbenchRegistry } from "../../workbench/registry";
import { useSkillEditorStore } from "../../stores/skill-editor-store";
import SkillEditor from "./SkillEditor";

const SKILL_URI_PREFIX = "skill://";
const NEW_SKILL_URI = "skill://new";

workbenchRegistry.registerEditorType({
  id: "skills.editor",
  scheme: "skill",
  title: (uri) => {
    if (uri === NEW_SKILL_URI) return "Nouveau prompt";
    const ref = uri.slice(SKILL_URI_PREFIX.length);
    return ref || "Prompt";
  },
  icon: () => Variable,
  iconClassName: "text-[var(--chart-3)]",
  render: ({ uri, api }) => createElement(SkillEditor, { uri, api }),
  getChatContext: (uri) => {
    // Read the live buffer published by the open SkillEditor. When the editor
    // hasn't mounted yet (URI in dockview but never activated), return null —
    // the chat pill will show "no view context".
    const handle = useSkillEditorStore.getState().handles.get(uri);
    if (!handle) return null;
    const label = handle.isNew
      ? "Prompt (brouillon)"
      : `Prompt : ${handle.ref || "(sans nom)"}`;
    return {
      scope: `skill-editor://${uri}`,
      label,
      data: {
        ref: handle.isNew ? null : handle.ref,
        isNew: handle.isNew,
        dirty: handle.dirty,
        description: handle.description || null,
        body: handle.body,
        bodyCharCount: handle.body.length,
      },
    };
  },
});
