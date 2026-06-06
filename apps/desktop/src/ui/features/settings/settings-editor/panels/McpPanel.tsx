import { useEffect, useState } from "react";
import { Trans } from "react-i18next";

import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import type {
  McpServerStatus,
  McpToolInfo,
} from "@/application/ports/settings-gateway";
import {
  CLAUDE_INSTALL_CMD,
  CODEX_INSTALL_CMD,
  MCP_SERVER_NAME,
  MCP_SERVER_URL,
} from "../parts/mcp-constants";
import McpStatusIndicator from "../components/McpStatusIndicator";
import InstallSnippet from "../components/InstallSnippet";
import McpToolsList from "../components/McpToolsList";

const McpPanel = () => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [tools, setTools] = useState<ReadonlyArray<McpToolInfo> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      settingsGateway
        .getMcpServerStatus()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
    };
    refresh();
    // Re-poll while the panel is open — the server boots asynchronously, so a
    // freshly-opened Settings view may catch it before it's listening.
    const id = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [settingsGateway]);

  useEffect(() => {
    let cancelled = false;
    settingsGateway
      .listMcpTools()
      .then((next) => {
        if (!cancelled) setTools(next);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsGateway]);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-primary">
            {t("settings.mcp.serverTitle", { name: MCP_SERVER_NAME })}
          </p>
          <McpStatusIndicator status={status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.mcp.description")}
        </p>
      </div>
      <InstallSnippet label="Claude Code" command={CLAUDE_INSTALL_CMD} />
      <InstallSnippet label="Codex" command={CODEX_INSTALL_CMD} />
      <p className="text-xs text-muted-foreground">
        <Trans
          t={t}
          i18nKey="settings.mcp.endpoint"
          values={{ url: MCP_SERVER_URL }}
          components={{ mono: <span className="font-mono" /> }}
        />
      </p>
      <McpToolsList tools={tools} />
    </section>
  );
};

export default McpPanel;
