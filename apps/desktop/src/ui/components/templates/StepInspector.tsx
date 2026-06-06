import TransformRunConfig from "./step-inspector/config/TransformRunConfig";
import WebhookCallConfig from "./step-inspector/config/WebhookCallConfig";
import SelectMarkdownConfigEditor from "./step-inspector/config/SelectMarkdownConfigEditor";
import BranchCasesEditor from "./step-inspector/config/BranchCasesEditor";
import BranchJsonConfigEditor from "./step-inspector/config/BranchJsonConfigEditor";
import JsonTransformsEditor from "./step-inspector/config/JsonTransformsEditor";
import FilesLoadManifestConfigEditor from "./step-inspector/config/FilesLoadManifestConfigEditor";
import BranchMatchTargetEditor from "./step-inspector/config/BranchMatchTargetEditor";
import WorkflowCallConfig from "./step-inspector/config/WorkflowCallConfig";
import TemplateInvokeConfig from "./step-inspector/config/TemplateInvokeConfig";
import GitCloneConfig from "./step-inspector/config/GitCloneConfig";
import GitlabMrCreateConfig from "./step-inspector/config/GitlabMrCreateConfig";
import GitlabMrMergeConfig from "./step-inspector/config/GitlabMrMergeConfig";
import GitlabFilesFetchConfig from "./step-inspector/config/GitlabFilesFetchConfig";
import WorkspaceSetConfig from "./step-inspector/config/WorkspaceSetConfig";
import FileLoadConfig from "./step-inspector/config/FileLoadConfig";
import FilesLoadConfig from "./step-inspector/config/FilesLoadConfig";
import FileLoadMarkdownConfig from "./step-inspector/config/FileLoadMarkdownConfig";
import ClaudeCodeInvokeConfig from "./step-inspector/config/ClaudeCodeInvokeConfig";
import CodexInvokeConfig from "./step-inspector/config/CodexInvokeConfig";
import OpenrouterInvokeConfig from "./step-inspector/config/OpenrouterInvokeConfig";
import HumanGateConfig from "./step-inspector/config/HumanGateConfig";
import LinearFetchConfig from "./step-inspector/config/LinearFetchConfig";
import ShellExecConfig from "./step-inspector/config/ShellExecConfig";
import SkillLoaderConfig from "./step-inspector/config/SkillLoaderConfig";
import ConcatMarkdownConfig from "./step-inspector/config/ConcatMarkdownConfig";
import PolymorphismKindEditor from "./step-inspector/config/PolymorphismKindEditor";
import SuggestedNodes from "./step-inspector/components/SuggestedNodes";
import PortsWiring from "./step-inspector/components/PortsWiring";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ActorRole,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../domain/workflow/types";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import { useT } from "../../i18n";
import { getKindMeta, polymorphismOf } from "./step-kinds";
import StepHeader from "./step-inspector/components/StepHeader";
import { ACTOR_ROLES } from "./step-inspector/parts/inspector-constants";

const KINDS_WITH_CONFIG: ReadonlySet<string> = new Set([
  "claude_code.invoke",
  "codex.invoke",
  "openrouter.invoke",
  "linear.fetch",
  "workspace.set",
  "shell.exec",
  "git.clone",
  "gitlab.mr.create",
  "gitlab.mr.merge",
  "gitlab.files.fetch",
  "file.load",
  "files.load",
  "files.load-manifest",
  "file.load-markdown",
  "skill.loader",
  "concat.markdown",
  "transform.run",
  "webhook.call",
  "human.gate",
  "branch.bool",
  "branch.match",
  "branch.json",
  "select.markdown",
  "json.transform",
  "workflow.call",
  "template.invoke",
]);

type Props = {
  step: TemplateStepDraft;
  isEntry: boolean;
  variables: ReadonlyArray<TemplateVariableDraft>;
  onChange: (next: TemplateStepDraft) => void;
  onDelete: () => void;
  onSetEntry: () => void;
  onRequestCreateSkill?: () => void;
  /** Optional handler: when set, the header renders a "Tester la node" button. */
  onEnterStudio?: () => void;
};

const StepInspector = ({
  step,
  isEntry,
  variables,
  onChange,
  onDelete,
  onSetEntry,
  onRequestCreateSkill,
  onEnterStudio,
}: Props) => {
  const t = useT();
  const meta = getKindMeta(step.kind);
  const config = step.config;
  const specs = useNodeSpecs();
  const base =
    specs.status === "ready" ? specs.byKind.get(step.kind) ?? null : null;
  const resolvedSpec = base
    ? resolveNodeSpec(step.kind, config, base, { variables })
    : null;
  const polymorphism = polymorphismOf(step.kind);

  const setConfig = (patch: Record<string, unknown>) =>
    onChange({ ...step, config: { ...config, ...patch } });

  const hasWiring =
    resolvedSpec !== null &&
    (resolvedSpec.inputs.length > 0 || resolvedSpec.outputs.length > 0);
  const hasKindConfig =
    polymorphism !== null || KINDS_WITH_CONFIG.has(step.kind);

  return (
    <div className="flex flex-col text-sm">
      <div className="px-3 py-3">
        <StepHeader
          step={step}
          meta={meta}
          isEntry={isEntry}
          onChange={onChange}
          onDelete={onDelete}
          onSetEntry={onSetEntry}
          onEnterStudio={onEnterStudio}
        />
      </div>

      <Section
        title={t("template.stepInspector.sections.configuration.title")}
        variant="panel"
        collapsible
        defaultOpen
        persistKey="app.step-inspector.config"
        className="px-2 py-2"
      >
        {!hasKindConfig ? (
          <p className="text-xs italic text-muted-foreground">
            {t("template.stepInspector.config.noParams")}
          </p>
        ) : null}

        {polymorphism ? (
          <PolymorphismKindEditor
            polymorphism={polymorphism}
            config={config}
            setConfig={setConfig}
          />
        ) : null}

        {step.kind === "claude_code.invoke" ? (
          <ClaudeCodeInvokeConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "codex.invoke" ? (
          <CodexInvokeConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "openrouter.invoke" ? (
          <OpenrouterInvokeConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "linear.fetch" ? (
          <LinearFetchConfig step={step} config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "workspace.set" ? (
          <WorkspaceSetConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "git.clone" ? (
          <GitCloneConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "gitlab.mr.create" ? (
          <GitlabMrCreateConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "gitlab.mr.merge" ? (
          <GitlabMrMergeConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "gitlab.files.fetch" ? (
          <GitlabFilesFetchConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "shell.exec" ? (
          <ShellExecConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "file.load" ? (
          <FileLoadConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "files.load" ? (
          <FilesLoadConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "file.load-markdown" ? (
          <FileLoadMarkdownConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "skill.loader" ? (
          <SkillLoaderConfig
            config={config}
            setConfig={setConfig}
            onRequestCreateSkill={onRequestCreateSkill}
          />
        ) : null}

        {step.kind === "concat.markdown" ? (
          <ConcatMarkdownConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "transform.run" ? (
          <TransformRunConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "webhook.call" ? (
          <WebhookCallConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "human.gate" ? (
          <HumanGateConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "branch.bool" ? (
          <BranchCasesEditor config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "branch.json" ? (
          <BranchJsonConfigEditor config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "select.markdown" ? (
          <SelectMarkdownConfigEditor config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "files.load-manifest" ? (
          <FilesLoadManifestConfigEditor
            config={config}
            setConfig={setConfig}
          />
        ) : null}

        {step.kind === "branch.match" ? (
          <BranchMatchTargetEditor config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "json.transform" ? (
          <JsonTransformsEditor config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "workflow.call" ? (
          <WorkflowCallConfig
            step={step}
            config={config}
            setConfig={setConfig}
            variables={variables}
            onChange={onChange}
          />
        ) : null}

        {step.kind === "template.invoke" ? (
          <TemplateInvokeConfig
            step={step}
            config={config}
            setConfig={setConfig}
            variables={variables}
            onChange={onChange}
          />
        ) : null}

      </Section>

      <Section
        title={t("template.stepInspector.sections.wiring.title")}
        description={t("template.stepInspector.sections.wiring.description")}
        variant="panel"
        collapsible
        defaultOpen
        persistKey="app.step-inspector.wiring"
        className="px-2 py-2"
      >
        {resolvedSpec === null ? (
          <p className="text-xs italic text-muted-foreground">
            {t("template.stepInspector.wiring.loading")}
          </p>
        ) : !hasWiring ? (
          <p className="text-xs italic text-muted-foreground">
            {t("template.stepInspector.wiring.empty")}
          </p>
        ) : (
          <PortsWiring
            step={step}
            spec={resolvedSpec}
            variables={variables}
            onChange={onChange}
          />
        )}
      </Section>

      {resolvedSpec ? (
        <SuggestedNodes spec={resolvedSpec} />
      ) : null}

      <Section
        title={t("template.stepInspector.sections.behavior.title")}
        variant="panel"
        collapsible
        defaultOpen={false}
        persistKey="app.step-inspector.behavior"
        className="px-2 py-2"
      >
        <FormField label={t("template.stepInspector.behavior.actor")}>
          <Select
            value={step.actorRole}
            onChange={(e) =>
              onChange({ ...step, actorRole: e.target.value as ActorRole })
            }
          >
            {ACTOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          orientation="inline"
          label={t("template.stepInspector.behavior.humanGateRequired")}
        >
          <Checkbox
            checked={step.humanGateRequired}
            onCheckedChange={(v) =>
              onChange({ ...step, humanGateRequired: v })
            }
          />
        </FormField>

        <FormField
          label={t("template.stepInspector.behavior.note.label")}
          description={t("template.stepInspector.behavior.note.description")}
        >
          <Textarea
            size="sm"
            className="min-h-[60px]"
            placeholder={t("template.stepInspector.behavior.note.placeholder")}
            value={step.note ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              onChange({
                ...step,
                note: next.length > 0 ? next : undefined,
              });
            }}
          />
        </FormField>
      </Section>

      <Section
        title={t("template.stepInspector.sections.advanced.title")}
        variant="panel"
        collapsible
        defaultOpen={false}
        persistKey="app.step-inspector.advanced"
        className="px-2 py-2"
      >
        <FormField
          label={t("template.stepInspector.advanced.id.label")}
          description={t("template.stepInspector.advanced.id.description")}
        >
          <Input
            className="font-mono text-xs"
            value={step.id}
            onChange={(e) => onChange({ ...step, id: e.target.value })}
          />
        </FormField>
        <FormField label={t("template.stepInspector.advanced.kind")}>
          <code className="rounded border border-input bg-muted/40 px-2 py-1 font-mono text-xs">
            {step.kind}
          </code>
        </FormField>
      </Section>
    </div>
  );
};

export default StepInspector;
