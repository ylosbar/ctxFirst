import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import {
  AGENT_BACKENDS,
  DEFAULT_AGENT_PROVIDER,
  defaultModelFor,
  isKnownProvider,
  type AgentProvider,
} from "@shared/wf/agent-backends";
import { BufferedInput } from "../components/buffered-inputs";
import { useT } from "../../../../i18n";

type AgentInvokeConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const AgentInvokeConfig = ({ config, setConfig }: AgentInvokeConfigProps) => {
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
            // Reset the model to the new provider's default in the same patch so
            // a Claude model never lingers on a Codex backend.
            setConfig({ provider: next, model: defaultModelFor(next) });
          }}
        >
          {AGENT_BACKENDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t("template.stepInspector.agent.model")}>
        <BufferedInput
          value={
            (config["model"] as string | undefined) ?? defaultModelFor(provider)
          }
          onChange={(e) => setConfig({ model: e.target.value })}
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

export default AgentInvokeConfig;
