/**
 * Modal d'édition du base prompt système du chat global (cf.
 * `specs/chat-system-prompt-editor.md`). La valeur éditée devient le défaut
 * appliqué à toute **nouvelle** conversation — les conversations existantes
 * (y compris celle ouverte au moment de l'édition) restent figées sur leur
 * snapshot. La section "tools" est codée en dur côté main et toujours
 * concaténée par `systemPromptForContext` ; on l'affiche en lecture seule
 * pour que l'utilisateur voie le prompt effectif complet sans pouvoir le
 * corrompre.
 *
 * i18n : la feature chat utilise encore des chaînes littérales FR (cf.
 * ChatActivityView / ChatConversation), non migrée i18next.
 */
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/ui/i18n";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";
import { useServices } from "@/ui/di/services-provider";
import { cn } from "@/lib/utils";
import type {
  ChatSystemPrompt,
  SettingsGateway,
} from "@/application/ports/settings-gateway";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ChatSystemPromptDialog = ({ open, onOpenChange }: Props) => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [payload, setPayload] = useState<ChatSystemPrompt | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  // Charge à chaque ouverture. Sortie : reset l'erreur transitoire mais
  // garde le payload pour un éventuel rebond instantané (rare).
  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    settingsGateway
      .getChatSystemPrompt()
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        setDraft(p.value ?? p.defaultValue);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, settingsGateway]);

  const handleReset = useCallback(() => {
    if (!payload) return;
    // Réinitialiser au défaut côté UI uniquement — la persistance se fait à
    // Enregistrer. Si l'utilisateur valide en l'état, le store détecte que la
    // valeur trimée est égale au défaut ? Non : on délègue "vide → reset" au
    // store. Pour un reset franc, on envoie une chaîne vide à Enregistrer.
    setDraft(payload.defaultValue);
  }, [payload]);

  const handleSave = useCallback(async () => {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      // Si l'utilisateur a remis le défaut tel quel, on envoie "" → le store
      // supprime la ligne, ce qui revient à "jamais personnalisé" et libère
      // la rétro-compat des futurs changements de défaut.
      const toSend = draft.trim() === payload.defaultValue.trim() ? "" : draft;
      const next = await settingsGateway.setChatSystemPrompt(toSend);
      setPayload(next);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [draft, onOpenChange, payload, settingsGateway]);

  const maxChars = payload?.maxChars ?? 8192;
  const length = draft.length;
  const overLimit = length > maxChars;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[10vh] z-50 flex max-h-[80vh] w-[960px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-semibold text-foreground">
                {t("chat.chatSystemPromptDialog.title")}
              </Dialog.Title>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("chat.chatSystemPromptDialog.descriptionPrefix")}{" "}
                <span className="font-medium">{t("chat.chatSystemPromptDialog.descriptionNew")}</span>{" "}
                {t("chat.chatSystemPromptDialog.descriptionSuffix")}
              </p>
            </div>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("common.close")}
                  className="shrink-0"
                >
                  <X className="size-4" />
                </Button>
              }
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : payload ? (
              <>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={payload.defaultValue}
                  className="min-h-[28rem] font-mono"
                  spellCheck={false}
                />
                <div
                  className={cn(
                    "text-right text-2xs tabular-nums",
                    overLimit ? "text-destructive" : "text-muted-foreground",
                  )}
                  title={
                    overLimit
                      ? t("chat.chatSystemPromptDialog.overLimitTitle", {
                          max: maxChars,
                        })
                      : undefined
                  }
                >
                  {length.toLocaleString()} / {maxChars.toLocaleString()}
                </div>

                <ToolsSectionPreview
                  toolsSection={payload.toolsSection}
                  open={toolsOpen}
                  onToggle={() => setToolsOpen((v) => !v)}
                />
              </>
            ) : null}

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={!payload || loading || saving}
              title={t("chat.chatSystemPromptDialog.resetTitle")}
            >
              {t("chat.chatSystemPromptDialog.reset")}
            </Button>
            <div className="flex items-center gap-2">
              <Dialog.Close
                render={
                  <Button variant="outline" size="sm" disabled={saving}>
                    {t("common.cancel")}
                  </Button>
                }
              />
              <Button
                variant="default"
                size="sm"
                onClick={() => void handleSave()}
                disabled={!payload || loading || saving}
              >
                {saving ? t("chat.chatSystemPromptDialog.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

type ToolsSectionPreviewProps = {
  toolsSection: string;
  open: boolean;
  onToggle: () => void;
};

/**
 * Affiche la section "tools disponibles" — codée en dur côté main, toujours
 * concaténée au prompt effectif. Lecture seule : modifier la liste depuis
 * l'UI casserait silencieusement le tool-calling.
 */
const ToolsSectionPreview = ({
  toolsSection,
  open,
  onToggle,
}: ToolsSectionPreviewProps) => {
  const t = useT();
  return (
  <div className="rounded-md border border-border bg-muted/30">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
      aria-expanded={open}
    >
      {open ? (
        <ChevronDown className="size-3.5" />
      ) : (
        <ChevronRight className="size-3.5" />
      )}
      <span>{t("chat.chatSystemPromptDialog.toolsSection")}</span>
    </button>
    {open ? (
      <pre className="border-t border-border bg-background/40 px-3 py-2 text-2xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
        {toolsSection}
      </pre>
    ) : null}
  </div>
  );
};

export default ChatSystemPromptDialog;

// Re-exported for tests / storybook ; the dialog is normally consumed via
// `<ChatSystemPromptDialog />` from `ChatConversation`.
export type ChatSystemPromptDialogProps = Props;
export type { SettingsGateway };
