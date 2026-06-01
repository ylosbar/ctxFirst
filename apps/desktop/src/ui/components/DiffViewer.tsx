import { ScrollArea } from "@/components/ui/scroll-area";
import PatchView, { looksLikeUnifiedDiff } from "./PatchView";
import { useT } from "../i18n";

type Props = {
  previous?: string | null;
  current: string;
};

const renderContent = (content: string) => {
  if (looksLikeUnifiedDiff(content)) {
    return <PatchView content={content} />;
  }
  return (
    <ScrollArea className="min-h-0 flex-1 bg-muted/30">
      <pre className="whitespace-pre-wrap p-4 font-mono text-xs">{content}</pre>
    </ScrollArea>
  );
};

const DiffViewer = ({ previous, current }: Props) => {
  const t = useT();
  if (!previous) {
    return renderContent(current);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-row">
      <div className="flex min-h-0 flex-1 flex-col border-r">
        <div className="border-b px-3 py-1 text-2xs uppercase tracking-wide text-muted-foreground">
          {t("components.diffViewer.previousVersion")}
        </div>
        {renderContent(previous)}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-3 py-1 text-2xs uppercase tracking-wide text-muted-foreground">
          {t("components.diffViewer.newVersion")}
        </div>
        {renderContent(current)}
      </div>
    </div>
  );
};

export default DiffViewer;
