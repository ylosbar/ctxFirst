import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { Trans } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import type {
  OpenRouterStatus,
  OpenRouterTestResult,
} from "@/application/ports/settings-gateway";
import { formatError } from "../parts/format-error";

const LlmProviderPanel = () => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [status, setStatus] = useState<OpenRouterStatus | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [newModelDraft, setNewModelDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<OpenRouterTestResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsGateway
      .getOpenRouterStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(formatError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [settingsGateway]);

  const onSaveKey = async () => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed) {
      setError(t("common.keyEmpty"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterApiKey(trimmed);
      setStatus(next);
      setApiKeyDraft("");
      setSavedAt(Date.now());
      setTestResult(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onClearKey = async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.clearOpenRouterApiKey();
      setStatus(next);
      setApiKeyDraft("");
      setTestResult(null);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onAddModel = async () => {
    const trimmed = newModelDraft.trim();
    if (!trimmed || !status) return;
    if (status.models.includes(trimmed)) {
      setError(t("settings.llm.modelExists"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterModels([
        ...status.models,
        trimmed,
      ]);
      setStatus(next);
      setNewModelDraft("");
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveModel = async (model: string) => {
    if (!status) return;
    if (status.models.length <= 1) {
      setError(t("settings.llm.keepOneModel"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterModels(
        status.models.filter((m) => m !== model),
      );
      setStatus(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSetDefault = async (model: string) => {
    if (!status || status.defaultModel === model) return;
    setError(null);
    setBusy(true);
    try {
      const next = await settingsGateway.setOpenRouterDefaultModel(model);
      setStatus(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setError(null);
    setTestResult(null);
    setBusy(true);
    try {
      const res = await settingsGateway.testOpenRouterConnection();
      setTestResult(res);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{"OpenRouter"}</p>
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.llm.openRouter.description"
            components={{ code: <code /> }}
          />
        </p>
      </div>

      <div className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-medium">{t("settings.llm.apiKey")}</p>
        {status?.hasApiKey ? (
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="settings.llm.keyConfigured"
              values={{ lastFour: status.lastFour }}
              components={{ mono: <span className="font-mono" /> }}
            />
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="settings.llm.keyNotConfigured"
              components={{ mono: <span className="font-mono" /> }}
            />
          </p>
        )}
        <div className="flex items-stretch gap-2">
          <PasswordInput
            id="openrouter-api-key"
            placeholder="sk-or-v1-…"
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            disabled={busy}
            revealLabel={t("common.showKey")}
            hideLabel={t("common.hideKey")}
            className="font-mono"
          />
          <Button
            type="button"
            onClick={onSaveKey}
            disabled={busy || apiKeyDraft.trim().length === 0}
          >
            {busy ? t("common.saving") : t("common.save")}
          </Button>
          {status?.hasApiKey && (
            <Button
              type="button"
              variant="destructive"
              onClick={onClearKey}
              disabled={busy}
            >
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-medium">{t("settings.llm.models.title")}</p>
        <p className="text-xs text-muted-foreground">
          <Trans
            t={t}
            i18nKey="settings.llm.models.description"
            components={{ code: <code />, mono: <span className="font-mono" /> }}
          />
        </p>
        <ul className="flex flex-col gap-1">
          {status?.models.map((model) => {
            const isDefault = model === status.defaultModel;
            return (
              <li
                key={model}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => void onSetDefault(model)}
                  disabled={busy || isDefault}
                  title={
                    isDefault
                      ? t("settings.llm.models.isDefault")
                      : t("settings.llm.models.setDefault")
                  }
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:cursor-default",
                    isDefault && "text-amber-500 disabled:opacity-100",
                  )}
                >
                  <Star
                    className="size-3.5"
                    fill={isDefault ? "currentColor" : "none"}
                  />
                </button>
                <span className="flex-1 truncate font-mono text-xs">{model}</span>
                {isDefault && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("settings.llm.models.default")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void onRemoveModel(model)}
                  disabled={busy || status.models.length <= 1}
                  title={
                    status.models.length <= 1
                      ? t("settings.llm.models.keepOne")
                      : t("settings.llm.models.remove")
                  }
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={newModelDraft}
            onChange={(e) => setNewModelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onAddModel();
              }
            }}
            disabled={busy}
            className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm shadow-xs transition-colors disabled:opacity-50"
            placeholder="anthropic/claude-sonnet-4"
          />
          <Button
            type="button"
            onClick={() => void onAddModel()}
            disabled={busy || newModelDraft.trim().length === 0}
          >
            <Plus className="size-4" />
            {t("common.add")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium">{t("settings.llm.test.title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("settings.llm.test.description")}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onTest}
            disabled={busy || !status?.hasApiKey}
          >
            {busy ? t("settings.llm.test.running") : t("settings.llm.test.run")}
          </Button>
          {testResult?.ok && (
            <p className="text-xs text-green-700 dark:text-green-400">
              <Trans
                t={t}
                i18nKey="settings.llm.test.ok"
                values={{
                  model: testResult.model,
                  latency: testResult.latencyMs,
                }}
                components={{ mono: <span className="font-mono" /> }}
              />
            </p>
          )}
          {testResult && !testResult.ok && (
            <p className="text-xs text-destructive" role="alert">
              {testResult.error}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {!error && savedAt && (
        <p className="text-xs text-muted-foreground">
          {t("settings.llm.saved")}
        </p>
      )}
    </section>
  );
};

export default LlmProviderPanel;
