import { i18n } from "@/ui/i18n";
import type { McpToolParamInfo } from "@/application/ports/settings-gateway";

/**
 * Renvoie l'objet `args` à envoyer au handler à partir des valeurs string
 * saisies dans le formulaire. Lève une erreur lisible si un champ JSON est
 * mal formé ou si un `number` n'est pas parsable.
 */
export const parseArgs = (
  params: ReadonlyArray<McpToolParamInfo>,
  values: Record<string, string>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    const raw = values[p.name] ?? "";
    if (raw === "" && p.optional) continue;
    if (p.kind === "string") {
      out[p.name] = raw;
    } else if (p.kind === "number") {
      const n = Number(raw);
      if (Number.isNaN(n))
        throw new Error(
          i18n.t("settings.mcp.playground.invalidNumber", { name: p.name }),
        );
      out[p.name] = n;
    } else if (p.kind === "boolean") {
      out[p.name] = raw === "true";
    } else {
      // json
      if (raw === "") {
        out[p.name] = {};
        continue;
      }
      try {
        out[p.name] = JSON.parse(raw);
      } catch (e) {
        throw new Error(
          i18n.t("settings.mcp.playground.invalidJson", {
            name: p.name,
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    }
  }
  return out;
};
