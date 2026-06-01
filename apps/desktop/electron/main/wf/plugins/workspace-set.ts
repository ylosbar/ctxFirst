/**
 * Runner du step kind "workspace.set".
 *
 * Effet pur sur l'état d'instance : pose le `cwd` qui sera utilisé par les
 * étapes natives suivantes (typiquement `claude_code.invoke` → CLI Claude). Aucun
 * artefact produit ; l'orchestrateur émet `WorkspaceChanged` puis valide
 * automatiquement le step.
 *
 * Le `cwd` est lu uniquement depuis `step.config.cwd` (champ saisi dans
 * l'inspecteur de la node). L'unique port d'entrée accepte n'importe quel
 * kind (`*`) : il sert uniquement à chainer la node dans le flow, son contenu
 * est ignoré côté runtime.
 */
import type {
  NodeSpec,
  StepOutcome,
  StepRunner,
} from "../application/step-runner";

export const createWorkspaceSetRunner = (): StepRunner => ({
  kind: "workspace.set",

  resolveSpec(): NodeSpec {
    return {
      title: "Workspace Set",
      description: "Sets the working directory for subsequent native steps.",
      inputs: [{ name: "in", kinds: ["*"], optional: true }],
      outputs: [],
      // Pure side-effect: emits no artifact but stays chainable. The
      // orchestrator's `previousDataStepId` skips over this kind when
      // resolving inputs for the downstream step.
      passthrough: true,
    };
  },

  async run(ctx): Promise<StepOutcome> {
    const cfg = ctx.step.config;
    const cwd =
      typeof cfg["cwd"] === "string" ? (cfg["cwd"]).trim() : "";
    if (!cwd) {
      throw new Error("workspace.set requires `step.config.cwd` to be set");
    }
    return { kind: "workspace-set", cwd };
  },
});
