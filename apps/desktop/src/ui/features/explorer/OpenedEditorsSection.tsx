import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useActiveEditor,
  useEditors,
  useWorkbench,
} from "../../workbench/WorkbenchProvider";
import { workbenchRegistry } from "../../workbench/registry";
import type { EditorState } from "../../workbench/types";
import ExplorerSection from "./ExplorerSection";

const LEAF_DEPTH = 0;
const PERSIST_KEY = "app.explorer.section.opened-resources";

type LeafProps = {
  readonly editor: EditorState;
  readonly isActive: boolean;
  readonly onPick: () => void;
  readonly onClose: () => void;
};

const OpenedEditorLeaf = ({ editor, isActive, onPick, onClose }: LeafProps) => {
  const type = workbenchRegistry.editorTypeFor(editor.uri);
  const label = type ? type.title(editor.uri) : editor.uri;
  const Icon = type?.icon?.(editor.uri);
  const iconClassName = type?.iconClassName ?? "text-muted-foreground";

  return (
    <div
      className={cn(
        "group/opened relative flex h-7 items-stretch",
        isActive
          ? "bg-gradient-to-r from-primary/40 via-primary/20 to-transparent text-foreground"
          : "hover:bg-accent/40 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onPick}
        title={label}
        aria-pressed={isActive}
        style={{ paddingInlineStart: 8 + LEAF_DEPTH * 12 }}
        className="flex min-w-0 flex-1 items-center gap-1.5 pr-1 text-left text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {Icon ? (
          <Icon className={cn("size-3.5 shrink-0", iconClassName)} />
        ) : (
          <span aria-hidden className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </button>
      <div className="flex shrink-0 items-center pr-2">
        <span className="relative flex size-4 items-center justify-center">
          {editor.dirty ? (
            <span
              aria-hidden
              className="size-2 rounded-full bg-foreground/60 transition-opacity group-hover/opened:opacity-0"
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Fermer ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute inset-0 size-4 text-muted-foreground opacity-0 group-hover/opened:opacity-100 focus-visible:opacity-100"
          >
            <X />
          </Button>
        </span>
      </div>
    </div>
  );
};

const OpenedEditorsSection = () => {
  const wb = useWorkbench();
  const editors = useEditors();
  const activeEditor = useActiveEditor();
  const activeUri = activeEditor?.uri ?? null;

  if (editors.length === 0) return null;

  return (
    <ExplorerSection
      title="Ressources ouvertes"
      persistKey={PERSIST_KEY}
      defaultOpen
      count={editors.length}
    >
      {editors.map((editor) => (
        <OpenedEditorLeaf
          key={editor.uri}
          editor={editor}
          isActive={activeUri === editor.uri}
          onPick={() => wb.openEditor(editor.uri, { focus: true })}
          onClose={() => wb.closeEditor(editor.uri)}
        />
      ))}
    </ExplorerSection>
  );
};

export default OpenedEditorsSection;
