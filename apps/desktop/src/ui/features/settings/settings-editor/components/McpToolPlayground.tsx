import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form-label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import type {
  McpInvokeResult,
  McpToolInfo,
} from "@/application/ports/settings-gateway";
import { parseArgs } from "../parts/parse-args";
import McpToolPlaygroundField from "./McpToolPlaygroundField";

type McpToolPlaygroundProps = { tool: McpToolInfo };

const McpToolPlayground = ({ tool }: McpToolPlaygroundProps) => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<McpInvokeResult | null>(null);
  const [running, setRunning] = useState(false);

  const setValue = (name: string, v: string) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const args = parseArgs(tool.parameters, values);
      const res = await settingsGateway.invokeMcpTool(tool.name, args);
      setResult(res);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: 0,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded border border-border bg-background/40 p-2">
      {tool.parameters.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          {t("settings.mcp.playground.noParams")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {tool.parameters.map((param) => (
            <McpToolPlaygroundField
              key={param.name}
              param={param}
              value={values[param.name] ?? ""}
              onChange={(v) => setValue(param.name, v)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void run()}
          disabled={running}
        >
          {running
            ? t("settings.mcp.playground.running")
            : t("settings.mcp.playground.run")}
        </Button>
        {result && (
          <span className="text-2xs text-muted-foreground">
            {t("settings.mcp.playground.duration", {
              ms: result.durationMs.toFixed(0),
            })}
            {result.ok ? (
              t("settings.mcp.playground.ok")
            ) : (
              <span className="text-destructive">
                {t("settings.mcp.playground.error")}
              </span>
            )}
          </span>
        )}
      </div>
      {result && (
        <div className="flex flex-col gap-1">
          <FormLabel className="text-2xs">
            {t("settings.mcp.playground.result")}
          </FormLabel>
          <ScrollArea className="max-h-64 rounded border border-input bg-background">
            <pre
              className={cn(
                "p-2 font-mono text-xs whitespace-pre",
                !result.ok && "text-destructive",
              )}
            >
              {result.ok ? result.text : result.error}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default McpToolPlayground;
