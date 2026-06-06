import { useEffect, useState } from "react";
import { Trans } from "react-i18next";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import type { LinearApiKeyStatus } from "@/domain/settings/types";
import { formatError } from "../parts/format-error";

const LinearApiKeyRow = () => {
  const t = useT();
  const { getLinearApiKeyStatus, setLinearApiKey, clearLinearApiKey } =
    useServices();

  const [status, setStatus] = useState<LinearApiKeyStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLinearApiKeyStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(formatError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [getLinearApiKeyStatus]);

  const onSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(t("common.keyEmpty"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next = await setLinearApiKey(trimmed);
      setStatus(next);
      setDraft("");
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setError(null);
    setSaving(true);
    try {
      const next = await clearLinearApiKey();
      setStatus(next);
      setSavedAt(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {t("settings.integrations.linear.title")}
        </p>
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.linear.description"
            components={{ code: <code /> }}
          />
        </p>
      </div>

      {status?.hasKey ? (
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.linear.configured"
            values={{ lastFour: status.lastFour }}
            components={{ mono: <span className="font-mono" /> }}
          />
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.integrations.linear.notConfigured"
            components={{ em: <em /> }}
          />
        </p>
      )}

      <div className="flex items-stretch gap-2">
        <PasswordInput
          id="linear-api-key"
          placeholder="lin_api_…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          revealLabel={t("common.showKey")}
          hideLabel={t("common.hideKey")}
          className="font-mono"
        />
        <Button
          type="button"
          onClick={onSave}
          disabled={saving || draft.trim().length === 0}
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        {status?.hasKey && (
          <Button
            type="button"
            variant="destructive"
            onClick={onClear}
            disabled={saving}
          >
            {t("common.delete")}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {!error && savedAt && (
        <p className="text-xs text-muted-foreground">
          {t("settings.integrations.linear.updated")}
        </p>
      )}
    </div>
  );
};

export default LinearApiKeyRow;
