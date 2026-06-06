import { FILE_LOAD_OUTPUT_KINDS } from "./step-inspector/parts/inspector-constants";
import TransformRunConfig from "./step-inspector/config/TransformRunConfig";
import WebhookCallConfig from "./step-inspector/config/WebhookCallConfig";
import SelectMarkdownConfigEditor from "./step-inspector/config/SelectMarkdownConfigEditor";
import BranchCasesEditor from "./step-inspector/config/BranchCasesEditor";
import BranchJsonConfigEditor from "./step-inspector/config/BranchJsonConfigEditor";
import JsonTransformsEditor from "./step-inspector/config/JsonTransformsEditor";
import FilesLoadSlotsEditor from "./step-inspector/config/FilesLoadSlotsEditor";
import FilesLoadManifestConfigEditor from "./step-inspector/config/FilesLoadManifestConfigEditor";
import BranchMatchTargetEditor from "./step-inspector/config/BranchMatchTargetEditor";
import WorkflowCallConfig from "./step-inspector/config/WorkflowCallConfig";
import TemplateInvokeConfig from "./step-inspector/config/TemplateInvokeConfig";
import SuggestedNodes from "./step-inspector/components/SuggestedNodes";
import PortsWiring from "./step-inspector/components/PortsWiring";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ActorRole,
  ArtifactKind,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../domain/workflow/types";
import { useServices } from "../../di/services-provider";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import useSkills from "../../hooks/useSkills";
import useArtifactSchemas from "../../hooks/useArtifactSchemas";
import { useWorkbench } from "../../workbench/store";
import { kindForArtifactSchema } from "../../../domain/workflow/types";
import { ExternalLink } from "lucide-react";
import { Trans } from "react-i18next";
import { useT } from "../../i18n";
import KindPreviewBlock from "../artifact-kinds/KindPreviewBlock";
import ShellExecExitCodeEditor, {
  type ExitCodesConfig,
} from "./ShellExecExitCodeEditor";
import {
  ARTIFACT_KINDS,
  getKindMeta,
  polymorphismOf,
} from "./step-kinds";
import StepHeader from "./step-inspector/components/StepHeader";

const ACTOR_ROLES: ReadonlyArray<ActorRole> = ["PO", "Developer", "LLMAgent"];

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
  const services = useServices();
  const workbench = useWorkbench();
  const meta = getKindMeta(step.kind);
  const config = step.config;
  const specs = useNodeSpecs();
  const { skills, loading: skillsLoading } = useSkills();
  const { types: artifactSchemas } = useArtifactSchemas();
  const base =
    specs.status === "ready" ? specs.byKind.get(step.kind) ?? null : null;
  const resolvedSpec = base
    ? resolveNodeSpec(step.kind, config, base, { variables })
    : null;
  const polymorphism = polymorphismOf(step.kind);

  const setConfig = (patch: Record<string, unknown>) =>
    onChange({ ...step, config: { ...config, ...patch } });

  const pickCwd = async () => {
    const current = (config["cwd"] as string | undefined) ?? "";
    const picked = await services.pickDirectory({
      defaultPath: current || undefined,
    });
    if (picked) setConfig({ cwd: picked });
  };

  const pickBasePath = async () => {
    const current = (config["path"] as string | undefined) ?? "";
    const picked = await services.pickDirectory({
      defaultPath: current || undefined,
    });
    if (picked) setConfig({ path: picked });
  };

  const pickMarkdownPath = async () => {
    const current = (config["path"] as string | undefined) ?? "";
    const picked = await services.pickFile({
      defaultPath: current || undefined,
      title: t("template.stepInspector.markdownPicker.title"),
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
        {
          name: t("template.stepInspector.markdownPicker.allFiles"),
          extensions: ["*"],
        },
      ],
    });
    if (picked) setConfig({ path: picked });
  };

  const pickFilePath = async () => {
    const current = (config["path"] as string | undefined) ?? "";
    const picked = await services.pickFile({
      defaultPath: current || undefined,
      title: t("template.stepInspector.filePicker.title"),
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
        { name: "JSON", extensions: ["json"] },
        {
          name: t("template.stepInspector.filePicker.allFiles"),
          extensions: ["*"],
        },
      ],
    });
    if (picked) setConfig({ path: picked });
  };

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
          (() => {
            const currentKind =
              (config[polymorphism.kind] as string | undefined) ?? "";
            const dynamicKinds = artifactSchemas.map((t) => kindForArtifactSchema(t));
            const knownKinds = new Set<string>([
              ...ARTIFACT_KINDS,
              ...dynamicKinds,
            ]);
            const showCurrentOption =
              currentKind.length > 0 && !knownKinds.has(currentKind);
            return (
              <FormField
                label={
                  polymorphism.kind === "outputKind"
                    ? t("template.stepInspector.polymorphism.outputKindLabel")
                    : t("template.stepInspector.polymorphism.inputKindLabel")
                }
                description={t("template.stepInspector.polymorphism.description")}
              >
                <Select
                  value={currentKind}
                  onChange={(e) => {
                    const next = e.target.value as ArtifactKind;
                    setConfig({ [polymorphism.kind]: next });
                  }}
                >
                  <option value="">{t("template.stepInspector.kindSelect.choose")}</option>
                  {ARTIFACT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                  {dynamicKinds.length > 0 ? (
                    <optgroup label={t("template.stepInspector.kindSelect.userPlugin")}>
                      {dynamicKinds.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {showCurrentOption ? (
                    <option value={currentKind}>
                      {t("template.stepInspector.kindSelect.orphan", { kind: currentKind })}
                    </option>
                  ) : null}
                </Select>
                {currentKind ? (
                  <KindPreviewBlock
                    kind={currentKind as ArtifactKind}
                    className="mt-2"
                  />
                ) : null}
              </FormField>
            );
          })()
        ) : null}

        {step.kind === "claude_code.invoke" ? (
          <>
            <FormField label={t("template.stepInspector.claudeCode.model")}>
              <Input
                value={(config["model"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ model: e.target.value })}
              />
            </FormField>
            <FormField label={t("template.stepInspector.fields.maxTokens")}>
              <Input
                type="number"
                min={1}
                value={(config["maxTokens"] as number | undefined) ?? 8000}
                onChange={(e) =>
                  setConfig({ maxTokens: Number(e.target.value) })
                }
              />
            </FormField>
          </>
        ) : null}

        {step.kind === "codex.invoke" ? (
          <>
            <FormField label={t("template.stepInspector.codex.model")}>
              <Input
                value={(config["model"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ model: e.target.value })}
              />
            </FormField>
            <FormField label={t("template.stepInspector.fields.maxTokens")}>
              <Input
                type="number"
                min={1}
                value={(config["maxTokens"] as number | undefined) ?? 8000}
                onChange={(e) =>
                  setConfig({ maxTokens: Number(e.target.value) })
                }
              />
            </FormField>
          </>
        ) : null}

        {step.kind === "openrouter.invoke" ? (
          <>
            <FormField
              label={t("template.stepInspector.openrouter.model.label")}
              description={
                <Trans
                  t={t}
                  i18nKey="template.stepInspector.openrouter.model.description"
                  components={{ code: <code /> }}
                />
              }
            >
              <Input
                placeholder={t("template.stepInspector.openrouter.model.placeholder")}
                value={(config["model"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ model: e.target.value })}
              />
            </FormField>
            <FormField label={t("template.stepInspector.fields.maxTokens")}>
              <Input
                type="number"
                min={1}
                value={(config["maxTokens"] as number | undefined) ?? 4000}
                onChange={(e) =>
                  setConfig({ maxTokens: Number(e.target.value) })
                }
              />
            </FormField>
          </>
        ) : null}

        {step.kind === "linear.fetch" ? (
          <>
            <FormField label={t("template.stepInspector.linear.ticketRef.label")}>
              <Input
                placeholder={t("template.stepInspector.linear.ticketRef.placeholder")}
                value={(config["ticketRef"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ ticketRef: e.target.value })}
              />
            </FormField>
            {step.humanGateRequired ? (
              <FormField
                label={t("template.stepInspector.linear.actorRole.label")}
                description={t("template.stepInspector.linear.actorRole.description")}
              >
                <Select
                  value={
                    (config["actorRole"] as string | undefined) ??
                    step.actorRole
                  }
                  onChange={(e) => setConfig({ actorRole: e.target.value })}
                >
                  {ACTOR_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
          </>
        ) : null}

        {step.kind === "workspace.set" ? (
          <FormField
            label={t("template.stepInspector.workspaceSet.cwd.label")}
            description={
              <Trans
                t={t}
                i18nKey="template.stepInspector.workspaceSet.cwd.description"
                components={{ code: <code /> }}
              />
            }
          >
            <div className="flex items-center gap-2">
              <Input
                className="font-mono"
                placeholder="/chemin/absolu/vers/le/repo"
                value={(config["cwd"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ cwd: e.target.value })}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={pickCwd}
              >
                {t("template.stepInspector.browse")}
              </Button>
            </div>
          </FormField>
        ) : null}

        {step.kind === "git.clone" ? (
          <>
            <FormField label={t("template.stepInspector.gitClone.repoUrl.label")}>
              <Input
                className="font-mono"
                placeholder="https://gitlab.com/group/project.git"
                value={(config["repoUrl"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ repoUrl: e.target.value })}
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.gitClone.baseDir.label")}
              description={
                <Trans
                  t={t}
                  i18nKey="template.stepInspector.gitClone.baseDir.description"
                  components={{ code: <code /> }}
                />
              }
            >
              <Input
                className="font-mono"
                placeholder={t(
                  "template.stepInspector.gitClone.baseDir.placeholder",
                )}
                value={(config["baseDir"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ baseDir: e.target.value })}
              />
            </FormField>

            <FormField label={t("template.stepInspector.gitClone.folder.label")}>
              <Input
                className="font-mono"
                placeholder="group/project"
                value={(config["folder"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ folder: e.target.value })}
              />
            </FormField>

            <FormField label={t("template.stepInspector.gitClone.branch.label")}>
              <Input
                className="font-mono"
                placeholder={t(
                  "template.stepInspector.gitClone.branch.placeholder",
                )}
                value={(config["branch"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ branch: e.target.value })}
              />
            </FormField>

            <FormField
              orientation="inline"
              label={t("template.stepInspector.gitClone.cleanBefore.label")}
              description={t(
                "template.stepInspector.gitClone.cleanBefore.description",
              )}
            >
              <Checkbox
                checked={config["cleanBefore"] !== false}
                onCheckedChange={(v) => setConfig({ cleanBefore: v })}
              />
            </FormField>
          </>
        ) : null}

        {step.kind === "gitlab.mr.create" ? (
          <>
            <FormField
              label={t("template.stepInspector.gitlabMrCreate.project.label")}
              description={t(
                "template.stepInspector.gitlabMrCreate.project.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="group/project"
                value={(config["project"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ project: e.target.value })}
              />
            </FormField>

            <FormField
              label={t(
                "template.stepInspector.gitlabMrCreate.sourceBranch.label",
              )}
            >
              <Input
                className="font-mono"
                placeholder="feature/x"
                value={(config["sourceBranch"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ sourceBranch: e.target.value })}
              />
            </FormField>

            <FormField
              label={t(
                "template.stepInspector.gitlabMrCreate.targetBranch.label",
              )}
            >
              <Input
                className="font-mono"
                placeholder="main"
                value={(config["targetBranch"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ targetBranch: e.target.value })}
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.gitlabMrCreate.title.label")}
            >
              <Input
                value={(config["title"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ title: e.target.value })}
              />
            </FormField>

            <FormField
              label={t(
                "template.stepInspector.gitlabMrCreate.description.label",
              )}
            >
              <Textarea
                size="sm"
                value={(config["description"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ description: e.target.value })}
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.gitlabMrCreate.baseUrl.label")}
              description={t(
                "template.stepInspector.gitlabMrCreate.baseUrl.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="https://gitlab.com"
                value={(config["baseUrl"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ baseUrl: e.target.value })}
              />
            </FormField>
          </>
        ) : null}

        {step.kind === "gitlab.mr.merge" ? (
          <>
            <FormField
              label={t("template.stepInspector.gitlabMrMerge.project.label")}
              description={t(
                "template.stepInspector.gitlabMrMerge.project.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="group/project"
                value={(config["project"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ project: e.target.value })}
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.gitlabMrMerge.iid.label")}
              description={t(
                "template.stepInspector.gitlabMrMerge.iid.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="42"
                value={(config["mergeRequestIid"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ mergeRequestIid: e.target.value })}
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.gitlabMrMerge.baseUrl.label")}
              description={t(
                "template.stepInspector.gitlabMrMerge.baseUrl.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="https://gitlab.com"
                value={(config["baseUrl"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ baseUrl: e.target.value })}
              />
            </FormField>
          </>
        ) : null}

        {step.kind === "gitlab.files.fetch" ? (
          <>
            <FormField
              label={t("template.stepInspector.gitlabFilesFetch.project.label")}
              description={t(
                "template.stepInspector.gitlabFilesFetch.project.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="group/project"
                value={(config["project"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ project: e.target.value })}
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.gitlabFilesFetch.ref.label")}
              description={t(
                "template.stepInspector.gitlabFilesFetch.ref.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="main"
                value={(config["ref"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ ref: e.target.value })}
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.gitlabFilesFetch.baseUrl.label")}
              description={t(
                "template.stepInspector.gitlabFilesFetch.baseUrl.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="https://gitlab.com"
                value={(config["baseUrl"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ baseUrl: e.target.value })}
              />
            </FormField>

            <FormField
              label={t(
                "template.stepInspector.gitlabFilesFetch.basePath.label",
              )}
              description={t(
                "template.stepInspector.gitlabFilesFetch.basePath.description",
              )}
            >
              <Input
                className="font-mono"
                placeholder="docs"
                value={(config["basePath"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ basePath: e.target.value })}
              />
            </FormField>

            <FilesLoadSlotsEditor
              config={config}
              setConfig={setConfig}
              i18nNamespace="gitlabFilesFetch"
            />
          </>
        ) : null}

        {step.kind === "shell.exec" ? (
          <>
            <FormField label={t("template.stepInspector.shellExec.command")}>
              <Textarea
                size="sm"
                className="min-h-[60px] font-mono"
                placeholder={
                  (config["useShell"] === true
                    ? "yarn tsc --noEmit"
                    : "yarn") + ""
                }
                value={
                  typeof config["command"] === "string"
                    ? (config["command"])
                    : Array.isArray(config["command"])
                      ? (config["command"] as ReadonlyArray<string>).join(" ")
                      : ""
                }
                onChange={(e) => setConfig({ command: e.target.value })}
              />
            </FormField>

            <FormField
              orientation="inline"
              label={t("template.stepInspector.shellExec.useShell")}
            >
              <Checkbox
                checked={config["useShell"] === true}
                onCheckedChange={(v) => setConfig({ useShell: v })}
              />
            </FormField>

            <FormField label={t("template.stepInspector.shellExec.subdir.label")}>
              <Input
                className="font-mono"
                placeholder={t("template.stepInspector.shellExec.subdir.placeholder")}
                value={(config["subdir"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ subdir: e.target.value })}
              />
            </FormField>

            <FormField label={t("template.stepInspector.shellExec.timeout")}>
              <Input
                type="number"
                min={1000}
                max={600000}
                value={(config["timeoutMs"] as number | undefined) ?? 60000}
                onChange={(e) =>
                  setConfig({ timeoutMs: Number(e.target.value) })
                }
              />
            </FormField>

            <FormField
              label={t("template.stepInspector.shellExec.maxOutput.label")}
              description={
                <Trans
                  t={t}
                  i18nKey="template.stepInspector.shellExec.maxOutput.description"
                  components={{ code: <code /> }}
                />
              }
            >
              <Input
                type="number"
                min={1}
                value={Math.round(
                  ((config["maxOutputBytes"] as number | undefined) ??
                    256 * 1024) / 1024,
                )}
                onChange={(e) =>
                  setConfig({ maxOutputBytes: Number(e.target.value) * 1024 })
                }
              />
            </FormField>

            <FormField
              orientation="inline"
              label={t("template.stepInspector.shellExec.customExitCodes.label")}
              description={
                <Trans
                  t={t}
                  i18nKey="template.stepInspector.shellExec.customExitCodes.description"
                  components={{ code: <code /> }}
                />
              }
            >
              <Checkbox
                checked={config["exitCodes"] !== undefined}
                onCheckedChange={(v) => {
                  if (v) {
                    setConfig({
                      exitCodes: { ok: [0], other: "*" },
                    });
                  } else {
                    setConfig({ exitCodes: undefined });
                  }
                }}
              />
            </FormField>

            {config["exitCodes"] !== undefined ? (
              <ShellExecExitCodeEditor
                value={config["exitCodes"] as ExitCodesConfig}
                onChange={(next) => setConfig({ exitCodes: next })}
              />
            ) : null}
          </>
        ) : null}

        {step.kind === "file.load" ? (
          <>
            <FormField
              label={t("template.stepInspector.fileLoad.path.label")}
              description={
                <Trans
                  t={t}
                  i18nKey="template.stepInspector.fileLoad.path.description"
                  components={{ code: <code /> }}
                />
              }
            >
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono"
                  placeholder="/chemin/absolu/vers/data.json"
                  value={(config["path"] as string | undefined) ?? ""}
                  onChange={(e) => setConfig({ path: e.target.value })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={pickFilePath}
                >
                  {t("template.stepInspector.browse")}
                </Button>
              </div>
            </FormField>
            <FormField
              label={t("template.stepInspector.fileLoad.outputKind.label")}
              description={t(
                "template.stepInspector.fileLoad.outputKind.description",
              )}
            >
              <Select
                value={(config["outputKind"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ outputKind: e.target.value })}
              >
                {FILE_LOAD_OUTPUT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
              {typeof config["outputKind"] === "string" &&
              config["outputKind"] ? (
                <KindPreviewBlock
                  kind={config["outputKind"] as ArtifactKind}
                  className="mt-2"
                />
              ) : null}
            </FormField>
          </>
        ) : null}

        {step.kind === "files.load" ? (
          <>
            <FormField
              label={t("template.stepInspector.filesLoad.basePath.label")}
              description={
                <Trans
                  t={t}
                  i18nKey="template.stepInspector.filesLoad.basePath.description"
                  components={{ code: <code /> }}
                />
              }
            >
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono"
                  placeholder="/chemin/absolu/vers/dossier"
                  value={(config["path"] as string | undefined) ?? ""}
                  onChange={(e) => setConfig({ path: e.target.value })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={pickBasePath}
                >
                  {t("template.stepInspector.browse")}
                </Button>
              </div>
            </FormField>
            <FilesLoadSlotsEditor config={config} setConfig={setConfig} />
          </>
        ) : null}

        {step.kind === "file.load-markdown" ? (
          <FormField
            label={t("template.stepInspector.fileLoadMarkdown.path.label")}
            description={
              <Trans
                t={t}
                i18nKey="template.stepInspector.fileLoadMarkdown.path.description"
                components={{ code: <code /> }}
              />
            }
          >
            <div className="flex items-center gap-2">
              <Input
                className="font-mono"
                placeholder="/chemin/absolu/vers/spec.md"
                value={(config["path"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ path: e.target.value })}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={pickMarkdownPath}
              >
                {t("template.stepInspector.browse")}
              </Button>
            </div>
          </FormField>
        ) : null}

        {step.kind === "skill.loader" ? (
          (() => {
            const skillRef = (config["skillRef"] as string | undefined) ?? "";
            return (
              <FormField
                label={t("template.stepInspector.skillLoader.skill.label")}
                description={
                  <Trans
                    t={t}
                    i18nKey="template.stepInspector.skillLoader.skill.description"
                    components={{ code: <code /> }}
                  />
                }
              >
                <Select
                  value={skillRef}
                  onChange={(e) => {
                    if (e.target.value === "__create__") {
                      onRequestCreateSkill?.();
                      return;
                    }
                    setConfig({ skillRef: e.target.value });
                  }}
                >
                  <option value="">
                    {skillsLoading
                      ? t("template.stepInspector.skillLoader.loading")
                      : t("template.stepInspector.skillLoader.choose")}
                  </option>
                  {skills.map((s) => (
                    <option key={s.ref} value={s.ref}>
                      {s.ref}
                    </option>
                  ))}
                  <option value="__create__">{t("template.stepInspector.skillLoader.createNew")}</option>
                </Select>
                {skillRef ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 self-start gap-1.5 text-xs"
                    onClick={() =>
                      workbench.openEditor(`skill://${skillRef}`, { focus: true })
                    }
                  >
                    <ExternalLink className="size-3.5" />
                    {t("template.stepInspector.skillLoader.open")}
                  </Button>
                ) : null}
              </FormField>
            );
          })()
        ) : null}

        {step.kind === "concat.markdown" ? (
          <>
            <FormField
              label={t("template.stepInspector.concat.mode.label")}
              description={
                <Trans
                  t={t}
                  i18nKey="template.stepInspector.concat.mode.description"
                  values={{ example: "{{name}}" }}
                  components={{ code: <code /> }}
                />
              }
            >
              <Select
                value={(config["mode"] as string | undefined) ?? "concat"}
                onChange={(e) => setConfig({ mode: e.target.value })}
              >
                <option value="concat">{t("template.stepInspector.concat.mode.concat")}</option>
                <option value="template">{t("template.stepInspector.concat.mode.template")}</option>
              </Select>
            </FormField>
            <FormField label={t("template.stepInspector.concat.separator")}>
              <Input
                placeholder="\n\n"
                value={(config["separator"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ separator: e.target.value })}
              />
            </FormField>
            {((config["mode"] as string | undefined) ?? "concat") === "concat" ? (
              <FormField label={t("template.stepInspector.concat.order.label")}>
                <Select
                  value={
                    (config["order"] as string | undefined) ?? "top-to-bottom"
                  }
                  onChange={(e) => setConfig({ order: e.target.value })}
                >
                  <option value="top-to-bottom">
                    {t("template.stepInspector.concat.order.topToBottom")}
                  </option>
                  <option value="bottom-to-top">
                    {t("template.stepInspector.concat.order.bottomToTop")}
                  </option>
                </Select>
              </FormField>
            ) : (
              <>
                <FormField
                  label={t("template.stepInspector.concat.onMissing.label")}
                  description={t("template.stepInspector.concat.onMissing.description", { example: "{{name}}" })}
                >
                  <Select
                    value={
                      (config["onMissing"] as string | undefined) ?? "keep"
                    }
                    onChange={(e) => setConfig({ onMissing: e.target.value })}
                  >
                    <option value="keep">{t("template.stepInspector.concat.onMissing.keep")}</option>
                    <option value="empty">{t("template.stepInspector.concat.onMissing.empty")}</option>
                    <option value="error">{t("template.stepInspector.concat.onMissing.error")}</option>
                  </Select>
                </FormField>
                <FormField
                  label={t("template.stepInspector.concat.onUnused.label")}
                  description={t("template.stepInspector.concat.onUnused.description")}
                >
                  <Select
                    value={
                      (config["onUnused"] as string | undefined) ?? "append"
                    }
                    onChange={(e) => setConfig({ onUnused: e.target.value })}
                  >
                    <option value="append">
                      {t("template.stepInspector.concat.onUnused.append")}
                    </option>
                    <option value="ignore">{t("template.stepInspector.concat.onUnused.ignore")}</option>
                  </Select>
                </FormField>
              </>
            )}
            <FormField label={t("template.stepInspector.concat.header")}>
              <Textarea
                size="sm"
                className="min-h-[40px]"
                value={(config["header"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ header: e.target.value })}
              />
            </FormField>
            <FormField label={t("template.stepInspector.concat.footer")}>
              <Textarea
                size="sm"
                className="min-h-[40px]"
                value={(config["footer"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ footer: e.target.value })}
              />
            </FormField>
            {((config["mode"] as string | undefined) ?? "concat") === "concat" ? (
              <Section
                title={t("template.stepInspector.concat.perEntry.title")}
                description={t("template.stepInspector.concat.perEntry.description")}
                variant="card"
                density="compact"
                collapsible
                defaultOpen={false}
                persistKey="app.step-inspector.concat.per-entry"
              >
                {(["main", "markdown1", "markdown2", "markdown3"] as const).map(
                  (port) => {
                    const entriesCfg = config["entries"] as
                      | Record<string, { header?: string; footer?: string } | undefined>
                      | undefined;
                    const entry = entriesCfg?.[port];
                    const setEntry = (patch: {
                      header?: string;
                      footer?: string;
                    }) => {
                      const prev =
                        (config["entries"] as Record<string, unknown> | undefined) ??
                        {};
                      const prevPort =
                        (prev[port] as Record<string, unknown> | undefined) ?? {};
                      const next = {
                        ...prev,
                        [port]: { ...prevPort, ...patch },
                      };
                      setConfig({ entries: next });
                    };
                    return (
                      <div
                        key={port}
                        className="space-y-2 border-l-2 border-muted pl-3"
                      >
                        <p className="text-xs font-medium text-muted-foreground">
                          {port}
                        </p>
                        <FormField label={t("template.stepInspector.concat.perEntry.header")}>
                          <Textarea
                            size="sm"
                            className="min-h-[40px]"
                            value={entry?.header ?? ""}
                            onChange={(e) =>
                              setEntry({ header: e.target.value })
                            }
                          />
                        </FormField>
                        <FormField label={t("template.stepInspector.concat.perEntry.footer")}>
                          <Textarea
                            size="sm"
                            className="min-h-[40px]"
                            value={entry?.footer ?? ""}
                            onChange={(e) =>
                              setEntry({ footer: e.target.value })
                            }
                          />
                        </FormField>
                      </div>
                    );
                  },
                )}
              </Section>
            ) : null}
          </>
        ) : null}

        {step.kind === "transform.run" ? (
          <TransformRunConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "webhook.call" ? (
          <WebhookCallConfig config={config} setConfig={setConfig} />
        ) : null}

        {step.kind === "human.gate" ? (
          <>
            <FormField label={t("template.stepInspector.humanGate.role")}>
              <Input
                value={(config["role"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ role: e.target.value })}
              />
            </FormField>
            <FormField label={t("template.stepInspector.humanGate.prompt")}>
              <Textarea
                size="sm"
                className="min-h-[80px]"
                value={(config["prompt"] as string | undefined) ?? ""}
                onChange={(e) => setConfig({ prompt: e.target.value })}
              />
            </FormField>
          </>
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
