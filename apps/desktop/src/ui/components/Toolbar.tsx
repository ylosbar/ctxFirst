import {
  FilePlus,
  FolderOpen,
  HelpCircle,
  Play,
  Save,
  Settings,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import ToolbarButton from "./ToolbarButton";

const Toolbar = ({ onNewChat }: { onNewChat?: () => void }) => {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border bg-sidebar px-2.5 py-1.5">
      <ToolbarButton icon={FilePlus} label="New file" onClick={onNewChat} />
      <ToolbarButton icon={FolderOpen} label="Open" />
      <ToolbarButton icon={Save} label="Save" />
      <Separator orientation="vertical" className="mx-1 !h-5" />
      <ToolbarButton icon={Play} label="Run" />
      <div className="flex-1" />
      <ToolbarButton icon={Settings} label="Settings" />
      <ToolbarButton icon={HelpCircle} label="Help" />
    </div>
  );
};

export default Toolbar;
