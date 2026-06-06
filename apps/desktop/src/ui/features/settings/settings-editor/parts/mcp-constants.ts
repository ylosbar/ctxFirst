export const MCP_SERVER_NAME = "ctxfirst-templates";
export const MCP_SERVER_URL = "http://127.0.0.1:41234/mcp";

export const CLAUDE_INSTALL_CMD = `claude mcp add --transport http ${MCP_SERVER_NAME} ${MCP_SERVER_URL}`;
export const CODEX_INSTALL_CMD = `codex mcp add ${MCP_SERVER_NAME} --transport http --url ${MCP_SERVER_URL}`;
