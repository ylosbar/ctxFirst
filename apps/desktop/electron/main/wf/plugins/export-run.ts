/**
 * Runner du step kind `export_run`.
 *
 * Sérialise l'état complet du run dans lequel il s'exécute (events,
 * executions, artifacts inline, sessions LLM, runs, feedback loops) et le
 * persiste comme artifact de kind `RunExport`. L'artifact est lu / partagé
 * via le viewer d'artifacts existant — cf. `specs/run-export-json.md`.
 *
 * Self-reference assumée : le snapshot est pris avant l'émission du
 * `StepProducedArtifact` de ce step, donc le bundle décrit tout l'historique
 * « sauf la production de lui-même ». Documenté dans la spec.
 */
import { putArtifactPayload } from "../application/artifact-io";
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";
import type { ExportInstance } from "../application/use-cases/export-instance";
import type { ArtifactPayload } from "../domain/artifact-schemas";

export const createExportRunRunner = (
  exportInstance: ExportInstance,
): StepRunner => ({
  kind: "export_run",

  resolveSpec(): NodeSpec {
    return {
      title: "Export Run",
      description:
        "Snapshot complet du run (events, executions, artifacts inline, sessions LLM) en un seul JSON autocontenu.",
      // Optional `*` input — present so authors can anchor the step
      // anywhere in the DAG. The content is not consumed.
      inputs: [{ name: "trigger", kinds: ["*"], optional: true }],
      outputs: [
        {
          name: "bundle",
          kind: "RunExport",
          description: "Bundle JSON autocontenu décrivant l'instance entière",
          primary: true,
        },
      ],
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const bundle = await exportInstance(ctx.instanceId);
    const body = JSON.stringify(bundle, null, 2);
    const payload: ArtifactPayload<"RunExport"> = {
      format: "json",
      schemaVersion: 1,
      body,
    };
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "RunExport",
      payload,
      {
        source: "export_run",
        sizeBytes: String(Buffer.byteLength(body, "utf8")),
      },
    );
    return { kind: "produced", artifact };
  },
});
