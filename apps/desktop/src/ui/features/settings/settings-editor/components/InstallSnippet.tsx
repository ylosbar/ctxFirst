import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form-label";
import { useT } from "@/ui/i18n";

type InstallSnippetProps = {
  label: string;
  command: string;
};

const InstallSnippet = ({ label, command }: InstallSnippetProps) => {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <FormLabel className="text-sm text-foreground">{label}</FormLabel>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre">
          {command}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onCopy}
          aria-label={
            copied ? t("settings.mcp.copy.copied") : t("settings.mcp.copy.copy")
          }
          title={copied ? t("common.copied") : t("common.copy")}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
};

export default InstallSnippet;
