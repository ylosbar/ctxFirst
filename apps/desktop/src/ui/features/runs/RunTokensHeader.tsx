import { useT } from "../../i18n";
import { formatCostUsd, formatTokens } from "./build-token-stats";
import type { TokenModel } from "./token-stats-types";

type Props = {
  readonly model: TokenModel;
};

// Résumé inline des totaux de consommation, affiché à droite du titre du graphe
// de tokens. Coloré par catégorie pour rappeler les aires du graphe.
const RunTokensHeader = ({ model }: Props) => {
  const t = useT();
  // Option A : « tokens in » = entrée réelle, cache compris (cf.
  // specs/run-detail-tokens-cache-manquants.md). Le détail frais/caché reste
  // persisté en DB et porté par le modèle pour un éventuel affichage séparé.
  const totalInWithCache =
    model.totalIn + model.totalCacheCreate + model.totalCacheRead;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      <Stat
        label={t("runs.tokens.total")}
        value={formatTokens(model.totalTokens)}
      />
      <Stat
        label={t("runs.tokens.in")}
        value={formatTokens(totalInWithCache)}
        dotClass="bg-blue-500"
      />
      <Stat
        label={t("runs.tokens.out")}
        value={formatTokens(model.totalOut)}
        dotClass="bg-purple-500"
      />
      {model.totalCostUsd != null ? (
        <Stat
          label={t("runs.tokens.cost")}
          value={formatCostUsd(model.totalCostUsd)}
        />
      ) : null}
    </div>
  );
};

const Stat = ({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: string;
  dotClass?: string;
}) => (
  <div className="flex items-baseline gap-1">
    {dotClass ? (
      <span
        className={`mr-0.5 inline-block h-1.5 w-1.5 self-center rounded-full ${dotClass}`}
      />
    ) : null}
    <span>{label}</span>
    <span className="font-medium tabular-nums text-foreground">{value}</span>
  </div>
);

export default RunTokensHeader;
