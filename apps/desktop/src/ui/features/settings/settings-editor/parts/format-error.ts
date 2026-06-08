import { i18n } from "@/ui/i18n";

export const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return i18n.t("common.unknownError");
};
