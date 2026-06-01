import type { SystemGateway } from "../ports/system-gateway";
import type { WorkflowGateway } from "../ports/workflow-gateway";

const slugify = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "run";

type Deps = { workflows: WorkflowGateway; system: SystemGateway };

/**
 * Out-of-band run export: pulls the full self-contained bundle from the
 * engine (events, executions, inline artifacts, LLM sessions, feedback loops)
 * and writes it to disk through the native save dialog. Mirrors
 * {@link makeExportWorkflowTemplate}; the bundle itself is assembled main-side
 * so this use-case only serializes + persists.
 */
export const makeExportRun =
  ({ workflows, system }: Deps) =>
  async (instanceId: string): Promise<{ path: string | null }> => {
    const bundle = await workflows.exportRun(instanceId);
    const safeName = slugify(
      `run-${bundle.instance.id.slice(0, 8)}-${bundle.instance.templateId}`,
    );
    const path = await system.saveTextFile({
      content: JSON.stringify(bundle, null, 2),
      defaultFileName: `${safeName}.run.json`,
      title: "Exporter le run",
      filters: [{ name: "Run export JSON", extensions: ["json"] }],
    });
    return { path };
  };

export type ExportRun = ReturnType<typeof makeExportRun>;
