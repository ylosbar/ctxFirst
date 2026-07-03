import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import {
  AGENT_BACKENDS,
  DEFAULT_AGENT_PROVIDER,
  defaultModelFor,
  isKnownProvider,
  type AgentProvider,
} from "@shared/wf/agent-backends";
import {
  BufferedInput,
  BufferedTextarea,
} from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type AgentJudgeConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const AgentJudgeConfig = ({ config, setConfig }: AgentJudgeConfigProps) => {
  const t = useT();
  const rawProvider = config["provider"];
  const provider: AgentProvider = isKnownProvider(rawProvider)
    ? rawProvider
    : DEFAULT_AGENT_PROVIDER;
  return (
    <>
      <FormField
        label={t("template.stepInspector.agent.provider.label")}
        description={t("template.stepInspector.agent.provider.description")}
      >
        <Select
          value={provider}
          onChange={(e) => {
            const next = e.target.value as AgentProvider;
            setConfig({ provider: next, model: defaultModelFor(next) });
          }}
        >
          {AGENT_BACKENDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
        {provider !== "claude-code" ? (
          <p className="mt-1 text-xs italic text-muted-foreground">
            {t("template.stepInspector.agent.judgeSystemPromptNote")}
          </p>
        ) : null}
      </FormField>
      <FormField label={t("template.stepInspector.agent.model")}>
        <BufferedInput
          value={
            (config["model"] as string | undefined) ?? defaultModelFor(provider)
          }
          onChange={(e) => setConfig({ model: e.target.value })}
        />
      </FormField>
      <FormField
        label={t("template.stepInspector.agent.judgePrompt.label")}
        description={t("template.stepInspector.agent.judgePrompt.description")}
      >
        <BufferedTextarea
          size="sm"
          className="min-h-[60px]"
          value={(config["judgePrompt"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ judgePrompt: e.target.value })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.agent.maxAttempts")}>
        <BufferedInput
          type="number"
          min={1}
          value={(config["maxAttempts"] as number | undefined) ?? 3}
          onChange={(e) => setConfig({ maxAttempts: Number(e.target.value) })}
        />
      </FormField>
      <FormField label={t("template.stepInspector.fields.maxTokens")}>
        <BufferedInput
          type="number"
          min={1}
          value={(config["maxTokens"] as number | undefined) ?? 8000}
          onChange={(e) => setConfig({ maxTokens: Number(e.target.value) })}
        />
      </FormField>
    </>
  );
};

export default AgentJudgeConfig;
