import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useMemo } from "react";
import { skillEditorTheme } from "./skill-editor-theme";

// Languages embedded inside ``` fences of a skill prompt. Markdown's parser
// dispatches to these by matching the fence's info string against each
// description's name/alias. Passing a pre-loaded `support` makes the nested
// highlighting synchronous (no async load round-trip).
const NESTED_LANGS = [
  LanguageDescription.of({
    name: "typescript",
    alias: ["ts", "tsx"],
    support: javascript({ jsx: true, typescript: true }),
  }),
  LanguageDescription.of({
    name: "javascript",
    alias: ["js", "jsx"],
    support: javascript({ jsx: true }),
  }),
  LanguageDescription.of({ name: "json", support: json() }),
  LanguageDescription.of({ name: "yaml", alias: ["yml"], support: yamlLang() }),
];

type SkillSourceEditorProps = {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  /** When set, focus the editor on mount and place the caret at this offset. */
  readonly initialCaret?: number;
};

const SkillSourceEditor = ({
  value,
  onChange,
  disabled,
  placeholder,
  initialCaret,
}: SkillSourceEditorProps) => {
  const extensions = useMemo<Extension[]>(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: NESTED_LANGS }),
      EditorView.lineWrapping,
      skillEditorTheme,
    ],
    [],
  );

  const onCreateEditor = useCallback(
    (view: EditorView) => {
      if (initialCaret == null) return;
      const pos = Math.min(initialCaret, view.state.doc.length);
      view.dispatch({ selection: { anchor: pos } });
      view.focus();
    },
    [initialCaret],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      extensions={extensions}
      editable={!disabled}
      placeholder={placeholder}
      // "none" skips the lib's built-in light theme (hard-coded #fff bg) so our
      // CSS-variable-based skillEditorTheme follows the design system instead.
      theme="none"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: false, // no intrusive completion on prose
        searchKeymap: true,
        defaultKeymap: true,
        historyKeymap: true,
      }}
      className="flex h-full min-h-0 flex-col"
    />
  );
};

export default SkillSourceEditor;
