import { useState } from "react";
import { Play, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form-label";
import { useT } from "@/ui/i18n";
import type { McpToolInfo } from "@/application/ports/settings-gateway";
import McpToolPlayground from "./McpToolPlayground";

type McpToolsListProps = {
  /** `null` while the catalog is still loading. */
  tools: ReadonlyArray<McpToolInfo> | null;
};

const McpToolsList = ({ tools }: McpToolsListProps) => {
  const t = useT();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <FormLabel className="text-sm font-medium text-primary">
          {t("settings.mcp.toolsExposed")}
        </FormLabel>
        {tools !== null && (
          <Badge tone="neutral" size="sm" className="rounded">
            {tools.length}
          </Badge>
        )}
      </div>
      {tools === null ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : tools.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("settings.mcp.noTools")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded border border-border">
          {tools.map((tool) => {
            const isOpen = expanded.has(tool.name);
            return (
              <li key={tool.name} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs">{tool.name}</code>
                      <Badge
                        tone="neutral"
                        size="sm"
                        className="rounded uppercase"
                      >
                        {tool.group}
                      </Badge>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      {tool.title}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {tool.description}
                    </p>
                    {tool.parameters.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {tool.parameters.map((param) => (
                          <li
                            key={param.name}
                            className="text-2xs text-muted-foreground"
                          >
                            <span className="font-mono">{param.name}</span>
                            {!param.optional && (
                              <span className="text-destructive"> *</span>
                            )}
                            {param.description && (
                              <>{` — ${param.description}`}</>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle(tool.name)}
                    aria-label={isOpen ? t("common.close") : t("settings.mcp.test")}
                  >
                    {isOpen ? (
                      <X className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </Button>
                </div>
                {isOpen && <McpToolPlayground tool={tool} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default McpToolsList;
