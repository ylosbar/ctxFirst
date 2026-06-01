import { Gauge } from "lucide-react";
import type { ContextUsage } from "@/application/ports/chat-gateway";
import { useT } from "@/ui/i18n";

/**
 * Compteur affiché au-dessus de la chatbox : nombre de tokens de contexte de la
 * session en cours, tel qu'estimé par l'agent. Masqué tant que le nombre est
 * inconnu (session jamais sollicitée, juste après une compaction). Le détail
 * exact (nombre / fenêtre / pourcentage) est dans le tooltip ; la pill reste
 * compacte pour ne pas écraser le sélecteur de modèle voisin.
 */

const nf = new Intl.NumberFormat("fr-FR");

/** Abrège pour la pill : 12 480 → « 12,5k », 950 → « 950 ». */
const abbreviate = (n: number): string => {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(".", ",")}k`;
};

type ChatContextUsageProps = {
  usage: ContextUsage | null;
};

const ChatContextUsage = ({ usage }: ChatContextUsageProps) => {
  const t = useT();
  if (!usage || usage.tokens === null) return null;

  const { tokens, contextWindow, percent } = usage;
  const detail =
    t("chat.chatContextUsage.detail", {
      tokens: nf.format(tokens),
      window: nf.format(contextWindow),
    }) + (percent !== null ? t("chat.chatContextUsage.detailPercent", { value: Math.round(percent) }) : "");

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-2xs tabular-nums text-muted-foreground"
      title={detail}
    >
      <Gauge className="size-3" />
      {t("chat.chatContextUsage.tokens", { count: abbreviate(tokens) })}
      {percent !== null ? (
        <span className="opacity-70">{t("chat.chatContextUsage.percent", { value: Math.round(percent) })}</span>
      ) : null}
    </span>
  );
};

export default ChatContextUsage;
