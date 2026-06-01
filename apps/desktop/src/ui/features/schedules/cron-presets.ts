export type CronPreset = {
  readonly value: string;
  readonly label: string;
};

export const CRON_PRESETS: ReadonlyArray<CronPreset> = [
  { value: "*/30 * * * *", label: "Toutes les 30 minutes" },
  { value: "0 * * * *", label: "Toutes les heures" },
  { value: "0 9 * * *", label: "Tous les jours à 9h" },
  { value: "0 9 * * 1", label: "Tous les lundis à 9h" },
  { value: "0 9 1 * *", label: "Le 1er de chaque mois à 9h" },
];
