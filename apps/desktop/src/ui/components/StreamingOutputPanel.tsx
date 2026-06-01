import { useEffect, useRef } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ScrollArea, type ScrollAreaHandle } from "@/components/ui/scroll-area";

type Props = {
  text: string;
  title?: string;
};

const StreamingOutputPanel = ({ text, title = "Sortie LLM (streaming)" }: Props) => {
  const ref = useRef<ScrollAreaHandle | null>(null);

  useEffect(() => {
    const vp = ref.current?.viewport;
    if (vp) vp.scrollTop = vp.scrollHeight;
  }, [text]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader size="sm" title={title} />
      <ScrollArea ref={ref} className="min-h-0 flex-1 bg-muted/30">
        <pre className="whitespace-pre-wrap p-4 font-mono text-xs">
          {text || "(en attente de sortie…)"}
        </pre>
      </ScrollArea>
    </div>
  );
};

export default StreamingOutputPanel;
