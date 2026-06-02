import {
  MAX_SUM_VARIANTS,
  isSumArtifactKind,
  parseSumArtifactKind,
} from "@shared/wf/artifact-kind-grammar";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ActorRole,
  ArtifactKind,
  NodeSpecView,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../domain/workflow/types";
import { useServices } from "../../di/services-provider";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import useSkills from "../../hooks/useSkills";
import useParsers from "../../hooks/useParsers";
import useArtifactSchemas from "../../hooks/useArtifactSchemas";
import useStepKindSuggestions from "../../hooks/useStepKindSuggestions";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import { useWorkbench } from "../../workbench/store";
import { templateUriFor } from "../../features/templates/template-uri";
import { kindForArtifactSchema } from "../../../domain/workflow/types";
import { ExternalLink, FlaskConical, LogIn, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Trans } from "react-i18next";
import { useT } from "../../i18n";
import { cn } from "@/lib/utils";
import KindPreviewBlock from "../artifact-kinds/KindPreviewBlock";
import ShellExecExitCodeEditor, {
  type ExitCodesConfig,
} from "./ShellExecExitCodeEditor";
import {
  ARTIFACT_KINDS,
  FAMILY_LABEL,
  accentForKind,
  familyForKind,
  getKindMeta,
  iconForKind,
  polymorphismOf,
} from "./step-kinds";
import { portColor, portKindsLabel } from "./port-color";

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
  "file.load",
  "files.load",
  "file.load-markdown",
  "skill.loader",
  "concat.markdown",
  "transform.run",
  "webhook.call",
  "human.gate",
  "branch.bool",
  "branch.match",
  "json.transform",
  "workflow.call",
]);

/**
 * Output kinds proposés par le node `file.load`. Restreint aux kinds
 * text-envelope (un fichier est du texte) — cf. `FILE_LOAD_FORMATS` côté runner.
 */
const FILE_LOAD_OUTPUT_KINDS = ["Markdown", "Json"] as const;

const CASE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

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
              value={(config["skillRef"] as string | undefined) ?? ""}
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
          </FormField>
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

type StepHeaderProps = {
  step: TemplateStepDraft;
  meta: ReturnType<typeof getKindMeta>;
  isEntry: boolean;
  onChange: (next: TemplateStepDraft) => void;
  onDelete: () => void;
  onSetEntry: () => void;
  onEnterStudio?: () => void;
};

const StepHeader = ({
  step,
  meta,
  isEntry,
  onChange,
  onDelete,
  onSetEntry,
  onEnterStudio,
}: StepHeaderProps) => {
  const t = useT();
  const KindIcon = iconForKind(step.kind);
  const accent = accentForKind(step.kind);
  const family = familyForKind(step.kind);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        {/* Icon chip — mirrors the canvas node's family-tinted chip so the
            inspected node keeps its visual identity from canvas to inspector. */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 0 4px 0 color-mix(in srgb, ${accent} 35%, transparent)`,
          }}
        >
          <KindIcon className="h-4 w-4" style={{ color: accent }} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <Input
            aria-label={t("template.stepInspector.header.nameAriaLabel")}
            className="h-7 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-input"
            value={step.name}
            placeholder={t("template.stepInspector.header.namePlaceholder")}
            onChange={(e) => onChange({ ...step, name: e.target.value })}
          />
          <span className="px-1.5 text-2xs text-muted-foreground">
            {meta?.label ?? step.kind}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
          {onEnterStudio ? (
            <HeaderAction
              icon={FlaskConical}
              label={t("template.stepInspector.header.testNode")}
              onClick={onEnterStudio}
            />
          ) : null}
          <HeaderAction
            icon={LogIn}
            label={
              isEntry
                ? t("template.stepInspector.header.alreadyEntry")
                : t("template.stepInspector.header.setAsEntry")
            }
            onClick={onSetEntry}
            disabled={isEntry}
            activeColor={isEntry ? accent : undefined}
          />
          <HeaderAction
            icon={Trash2}
            label={t("template.stepInspector.header.deleteStep")}
            onClick={onDelete}
            danger
          />
        </div>
      </div>

      {meta?.description ? (
        <p className="text-xs leading-snug text-muted-foreground">
          {meta.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium"
          style={{
            color: accent,
            background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: accent }}
          />
          {FAMILY_LABEL[family]}
        </span>
        {isEntry ? (
          <Badge tone="success" size="sm">
            {t("template.stepInspector.header.entryBadge")}
          </Badge>
        ) : null}
        <Badge tone="neutral" size="sm">
          {step.actorRole}
        </Badge>
        {step.humanGateRequired ? (
          <Badge tone="warning" size="sm">
            {t("template.stepInspector.header.humanValidationBadge")}
          </Badge>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Compact icon-button used in the inspector header toolbar. Wraps the action in
 * a tooltip so the icon stays self-explanatory; `danger` tints the destructive
 * action on hover, `activeColor` marks a toggled-on state (e.g. current entry).
 */
const HeaderAction = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
  activeColor,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  activeColor?: string;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "text-muted-foreground",
            danger && "hover:bg-destructive/10 hover:text-destructive",
          )}
          style={activeColor ? { color: activeColor } : undefined}
        >
          <Icon />
        </Button>
      }
    />
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

type WorkflowCallConfigProps = {
  step: TemplateStepDraft;
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
  variables: ReadonlyArray<TemplateVariableDraft>;
  onChange: (next: TemplateStepDraft) => void;
};

/**
 * Editor for a `workflow.call` step (`sub-template-expand.md` §11a). Picks the
 * sub-template to inline at start, then binds its interface variables
 * (`input` → `readsFrom`, `output` → `writesTo`) onto the host's local
 * variables. The child's ports cannot be resolved by the renderer's
 * `resolveNodeSpec` (they depend on another template), so this component reads
 * the picked template's interface directly rather than going through
 * `PortsWiring`.
 */
const WorkflowCallConfig = ({
  step,
  config,
  setConfig,
  variables,
  onChange,
}: WorkflowCallConfigProps) => {
  const t = useT();
  const { templates, loading } = useWorkflowTemplates();
  const workbench = useWorkbench();

  const templateId = typeof config["templateId"] === "string" ? config["templateId"] : "";
  const templateVersion =
    typeof config["templateVersion"] === "string" ? config["templateVersion"] : "";
  const refKey = templateId && templateVersion ? `${templateId}@${templateVersion}` : "";

  // passThrough (`sub-workflow-passthrough.md`): inline an interface-less
  // sub-template as a pure side-effect sub-routine, wired by control flow only.
  const passThrough = config["passThrough"] === true;

  // Which templates are pickable depends on the mode: with an interface (normal
  // invocation), or without one (passThrough side-effect sub-routine).
  const isInvocable = (t: (typeof templates)[number]): boolean => {
    if (t.status !== "published") return false;
    const hasInterface = t.variables.some((v) => v.role === "input" || v.role === "output");
    return passThrough ? !hasInterface : hasInterface;
  };
  const invocable = templates.filter(isInvocable);
  const selected = templates.find((t) => `${t.id}@${t.version}` === refKey);
  // When the mode flips, a previously-picked template may no longer match the
  // filter — drop it from the picker so it falls back to "— choisir —".
  const pickerValue = selected && isInvocable(selected) ? refKey : "";
  const inputVars = selected?.variables.filter((v) => v.role === "input") ?? [];
  const outputVars = selected?.variables.filter((v) => v.role === "output") ?? [];

  const bind = (mapKey: "readsFrom" | "writesTo", port: string, variableName: string) => {
    const current = { ...(step[mapKey] ?? {}) };
    if (variableName === "") delete current[port];
    else current[port] = variableName;
    onChange({ ...step, [mapKey]: Object.keys(current).length > 0 ? current : undefined });
  };

  // Toggling passThrough clears any residual bindings (they were keyed by the
  // old interface), like selectTemplate does on a ref change.
  const togglePassThrough = (next: boolean) => {
    onChange({
      ...step,
      config: { ...config, passThrough: next },
      readsFrom: undefined,
      writesTo: undefined,
    });
  };

  const selectTemplate = (key: string) => {
    if (!key) {
      // Clear ref + stale bindings (they were keyed by the old interface).
      setConfig({ templateId: "", templateVersion: "" });
      onChange({ ...step, config: { ...config, templateId: "", templateVersion: "" }, readsFrom: undefined, writesTo: undefined });
      return;
    }
    const [id, version] = key.split("@");
    onChange({
      ...step,
      config: { ...config, templateId: id, templateVersion: version },
      readsFrom: undefined,
      writesTo: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label={t("template.stepInspector.workflowCall.subTemplate.label")}
        description={
          passThrough
            ? t("template.stepInspector.workflowCall.subTemplate.descriptionPassThrough")
            : t("template.stepInspector.workflowCall.subTemplate.description")
        }
      >
        <Select value={pickerValue} onChange={(e) => selectTemplate(e.target.value)}>
          <option value="">
            {loading
              ? t("template.stepInspector.workflowCall.loading")
              : t("template.stepInspector.workflowCall.choose")}
          </option>
          {invocable.map((t) => {
            const key = `${t.id}@${t.version}`;
            return (
              <option key={key} value={key}>
                {t.name} ({key})
              </option>
            );
          })}
        </Select>
      </FormField>

      <FormField
        orientation="inline"
        label={t("template.stepInspector.workflowCall.passThrough.label")}
        description={t("template.stepInspector.workflowCall.passThrough.description")}
      >
        <Checkbox checked={passThrough} onCheckedChange={(v) => togglePassThrough(v === true)} />
      </FormField>

      {refKey && !selected ? (
        <p className="text-xs italic text-destructive">
          {t("template.stepInspector.workflowCall.notFound", { refKey })}
        </p>
      ) : null}

      {selected && refKey ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start gap-1.5 text-xs"
          onClick={() => workbench.openEditor(templateUriFor(refKey), { focus: true })}
        >
          <ExternalLink className="size-3.5" />
          {t("template.stepInspector.workflowCall.openSub")}
        </Button>
      ) : null}

      {!passThrough && inputVars.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.workflowCall.inputsLabel")}</PortGroupLabel>
          {inputVars.map((iv) => {
            const candidates = variables.filter((v) => v.kind === iv.kind);
            return (
              <PortRow key={iv.name} name={iv.name} meta={iv.kind} color={portColor([iv.kind])}>
                <Select
                  value={step.readsFrom?.[iv.name] ?? ""}
                  onChange={(e) => bind("readsFrom", iv.name, e.target.value)}
                >
                  <option value="">{t("template.stepInspector.workflowCall.bindVar")}</option>
                  {candidates.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.kind})
                    </option>
                  ))}
                </Select>
              </PortRow>
            );
          })}
        </div>
      ) : null}

      {!passThrough && outputVars.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.workflowCall.outputsLabel")}</PortGroupLabel>
          {outputVars.map((ov) => {
            const candidates = variables.filter((v) => v.kind === ov.kind);
            return (
              <PortRow key={ov.name} name={ov.name} meta={ov.kind} color={portColor([ov.kind])}>
                <Select
                  value={step.writesTo?.[ov.name] ?? ""}
                  onChange={(e) => bind("writesTo", ov.name, e.target.value)}
                >
                  <option value="">{t("template.stepInspector.wiring.none")}</option>
                  {candidates.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.kind})
                    </option>
                  ))}
                </Select>
              </PortRow>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

type PortsWiringProps = {
  step: TemplateStepDraft;
  spec: NodeSpecView;
  variables: ReadonlyArray<TemplateVariableDraft>;
  onChange: (next: TemplateStepDraft) => void;
};

const PortsWiring = ({
  step,
  spec,
  variables,
  onChange,
}: PortsWiringProps) => {
  const t = useT();
  const writeTo = (port: string, variableName: string | "") => {
    const current = { ...(step.writesTo ?? {}) };
    if (variableName === "") {
      delete current[port];
    } else {
      current[port] = variableName;
    }
    onChange({
      ...step,
      writesTo: Object.keys(current).length > 0 ? current : undefined,
    });
  };

  const readFrom = (port: string, variableName: string | "") => {
    const current = { ...(step.readsFrom ?? {}) };
    if (variableName === "") {
      delete current[port];
    } else {
      current[port] = variableName;
    }
    onChange({
      ...step,
      readsFrom: Object.keys(current).length > 0 ? current : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {spec.inputs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.wiring.inputs")}</PortGroupLabel>
          {spec.inputs.map((p) => {
            const candidates = variables.filter(
              (v) => p.kinds.includes("*") || p.kinds.includes(v.kind),
            );
            const current = step.readsFrom?.[p.name] ?? "";
            return (
              <PortRow
                key={p.name}
                name={p.name}
                meta={`${portKindsLabel(p.kinds)}${p.optional ? " · optionnel" : ""}`}
                color={portColor(p.kinds)}
              >
                <Select
                  value={current}
                  onChange={(e) => readFrom(p.name, e.target.value)}
                >
                  <option value="">{t("template.stepInspector.wiring.upstreamTransition")}</option>
                  {candidates.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.kind})
                    </option>
                  ))}
                </Select>
              </PortRow>
            );
          })}
        </div>
      ) : null}

      {spec.outputs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.wiring.outputs")}</PortGroupLabel>
          {spec.outputs.map((o) => {
            const candidates = variables.filter((v) => v.kind === o.kind);
            const current = step.writesTo?.[o.name] ?? "";
            return (
              <PortRow
                key={o.name}
                name={o.name}
                meta={o.kind}
                color={portColor([o.kind])}
              >
                <Select
                  value={current}
                  onChange={(e) => writeTo(o.name, e.target.value)}
                >
                  <option value="">{t("template.stepInspector.wiring.none")}</option>
                  {candidates.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.kind})
                    </option>
                  ))}
                </Select>
              </PortRow>
            );
          })}
        </div>
      ) : spec.passthrough ? (
        <div className="flex flex-col gap-2">
          <PortGroupLabel>{t("template.stepInspector.wiring.outputs")}</PortGroupLabel>
          <p className="text-xs italic text-muted-foreground">
            {t("template.stepInspector.wiring.passthrough")}
          </p>
        </div>
      ) : null}
    </div>
  );
};

const PortGroupLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
    {children}
  </div>
);

const PortRow = ({
  name,
  meta,
  color,
  children,
}: {
  name: string;
  meta: string;
  /** Handle color from {@link portColor} — ties this row to its canvas handle. */
  color: string;
  children: React.ReactNode;
}) => (
  <div
    className="flex flex-col gap-1 border-l-2 pl-2"
    style={{ borderColor: color }}
  >
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-xs font-semibold">{name}</span>
      <span className="text-2xs text-muted-foreground">{meta}</span>
    </div>
    {children}
  </div>
);

type SuggestedNodesProps = {
  spec: NodeSpecView;
};

/**
 * Lists plugin-contributed step kinds whose manifest declared
 * `suggestedFor.inputKind === K` for one of this step's input kinds. Renders
 * as a non-intrusive code-action panel (no auto-insertion — user picks).
 * Hidden when no suggestion applies.
 *
 * Replaces the type-level "smart default" parser-as-option used to provide
 * (cf. `specs/artifact-typing-overhaul.md` §Pilier B).
 */
const SuggestedNodes = ({ spec }: SuggestedNodesProps) => {
  const concreteKinds = Array.from(
    new Set(
      spec.inputs.flatMap((p) =>
        p.kinds.filter((k): k is ArtifactKind => k !== "*"),
      ),
    ),
  );
  return (
    <>
      {concreteKinds.map((kind) => (
        <SuggestedNodesForKind key={kind} inputKind={kind} />
      ))}
    </>
  );
};

const SuggestedNodesForKind = ({ inputKind }: { inputKind: ArtifactKind }) => {
  const t = useT();
  const { suggestions } = useStepKindSuggestions(inputKind);
  if (suggestions.length === 0) return null;
  return (
    <Section
      title={t("template.stepInspector.suggestions.title", { kind: inputKind })}
      description={t("template.stepInspector.suggestions.description")}
      variant="panel"
      density="compact"
      collapsible
      defaultOpen
      persistKey={`app.step-inspector.suggestions.${inputKind}`}
      className="px-2 py-2"
    >
      <ul className="flex flex-col">
        {suggestions.map((s) => (
          <li
            key={s.stepKindId}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
          >
            <span className="font-mono">{s.label}</span>
            <span className="rounded bg-muted px-1 text-2xs uppercase text-muted-foreground">
              {t("template.stepInspector.suggestions.pluginBadge", { pluginId: s.pluginId })}
            </span>
            {s.role ? (
              <span className="rounded bg-accent px-1 text-2xs text-accent-foreground">
                {s.role}
              </span>
            ) : null}
            <span className="ml-auto truncate font-mono text-2xs text-muted-foreground">
              {s.stepKindId}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
};

type TransformRunConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const TransformRunConfig = ({ config, setConfig }: TransformRunConfigProps) => {
  const t = useT();
  const { parsers, loading } = useParsers(null);
  const rawRef = config["transformRef"];
  const ref =
    rawRef && typeof rawRef === "object"
      ? (rawRef as { id?: unknown; version?: unknown })
      : {};
  const refKey =
    typeof ref.id === "string" && typeof ref.version === "string" && ref.id
      ? `${ref.id}@${ref.version}`
      : "";

  return (
    <FormField
      label={t("template.stepInspector.transform.parser.label")}
      description={t("template.stepInspector.transform.parser.description")}
    >
      <Select
        value={refKey}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            setConfig({ transformRef: { id: "", version: "" } });
            return;
          }
          const [id, version] = v.split("@");
          setConfig({ transformRef: { id, version } });
        }}
      >
        <option value="">
          {loading
            ? t("template.stepInspector.transform.loading")
            : t("template.stepInspector.transform.choose")}
        </option>
        {parsers.map((p) => {
          const key = `${p.id}@${p.version}`;
          const target = `${p.forType.id}@${p.forType.version}`;
          const sourceTag =
            p.source.kind === "plugin"
              ? `plugin:${p.source.pluginId}`
              : "user";
          return (
            <option key={key} value={key}>
              {t("template.stepInspector.transform.parserOption", { key, target, sourceTag })}
            </option>
          );
        })}
      </Select>
    </FormField>
  );
};

type WebhookCallConfigProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Config editor for a `webhook.call` step. The `outputKind` select is rendered
 * upstream by the generic polymorphism block; this only covers the
 * HTTP-specific knobs. The `url` / `body` ports are wired in the "Câblage"
 * section — the URL fallback / body template here only apply when the matching
 * port is left unwired.
 */
const WebhookCallConfig = ({ config, setConfig }: WebhookCallConfigProps) => {
  const t = useT();
  const method = (config["method"] as string | undefined) ?? "GET";
  const rawHeaders = config["headers"];
  const headers: Record<string, string> =
    rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, string>)
      : {};
  const headerEntries = Object.entries(headers);
  const bodyAllowed = method !== "GET" && method !== "HEAD";

  const setHeaders = (next: Record<string, string>) =>
    setConfig({ headers: Object.keys(next).length > 0 ? next : undefined });

  const setHeaderKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of headerEntries) next[k === oldKey ? newKey : k] = v;
    setHeaders(next);
  };
  const setHeaderValue = (key: string, value: string) =>
    setHeaders({ ...headers, [key]: value });
  const removeHeader = (key: string) => {
    const next = { ...headers };
    delete next[key];
    setHeaders(next);
  };
  const addHeader = () => {
    let i = headerEntries.length;
    let candidate = `Header-${i}`;
    while (candidate in headers) {
      i += 1;
      candidate = `Header-${i}`;
    }
    setHeaders({ ...headers, [candidate]: "" });
  };

  return (
    <>
      <FormField label={t("template.stepInspector.webhook.method")}>
        <Select
          value={method}
          onChange={(e) => setConfig({ method: e.target.value })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label={t("template.stepInspector.webhook.urlFallback.label")}
        description={
          <Trans
            t={t}
            i18nKey="template.stepInspector.webhook.urlFallback.description"
            components={{ code: <code /> }}
          />
        }
      >
        <Input
          className="font-mono"
          placeholder="https://api.example.com/notify"
          value={(config["url"] as string | undefined) ?? ""}
          onChange={(e) => setConfig({ url: e.target.value })}
        />
      </FormField>

      <FormField
        label={t("template.stepInspector.webhook.headers.label")}
        description={t("template.stepInspector.webhook.headers.description")}
      >
        <div className="flex flex-col gap-1.5">
          {headerEntries.map(([key, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="font-mono text-xs"
                placeholder={t("template.stepInspector.webhook.headers.placeholder")}
                value={key}
                onChange={(e) => setHeaderKey(key, e.target.value)}
              />
              <Input
                className="font-mono text-xs"
                placeholder={t("template.stepInspector.webhook.headers.valuePlaceholder")}
                value={value}
                onChange={(e) => setHeaderValue(key, e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeHeader(key)}
              >
                {t("common.delete")}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addHeader}
            className="self-start"
          >
            {t("template.stepInspector.webhook.headers.add")}
          </Button>
        </div>
      </FormField>

      {bodyAllowed ? (
        <FormField
          label={t("template.stepInspector.webhook.body.label")}
          description={
            <Trans
              t={t}
              i18nKey="template.stepInspector.webhook.body.description"
              components={{ code: <code /> }}
            />
          }
        >
          <Textarea
            size="sm"
            className="min-h-[60px] font-mono"
            placeholder={'{ "event": "done" }'}
            value={(config["bodyTemplate"] as string | undefined) ?? ""}
            onChange={(e) => setConfig({ bodyTemplate: e.target.value })}
          />
        </FormField>
      ) : null}

      <FormField orientation="inline" label={t("template.stepInspector.webhook.failOnError")}>
        <Checkbox
          checked={config["failOnError"] !== false}
          onCheckedChange={(v) => setConfig({ failOnError: v })}
        />
      </FormField>
    </>
  );
};

type BranchCasesEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

/**
 * Inline editor for the `cases: string[]` config of a `branch.bool` step.
 * Materialized cases drive the node's output ports at runtime (the runner
 * derives `outputs[]` from this array) — the canvas picks the change up
 * automatically through `resolveNodeSpec`.
 *
 * Validation matches the runner-side regex so the user is corrected before
 * save instead of receiving a `StepFailed` at execution time.
 */
const BranchCasesEditor = ({ config, setConfig }: BranchCasesEditorProps) => {
  const t = useT();
  const raw = config["cases"];
  const cases: string[] = Array.isArray(raw)
    ? raw.filter((c): c is string => typeof c === "string")
    : [];

  const inputKind = (config["inputKind"] as string | undefined) ?? "Markdown";

  const updateCases = (next: string[]) => setConfig({ cases: next });

  const setCase = (index: number, value: string) => {
    const next = [...cases];
    next[index] = value;
    updateCases(next);
  };
  const removeCase = (index: number) => {
    if (cases.length <= 2) return;
    updateCases(cases.filter((_, i) => i !== index));
  };
  const addCase = () => {
    let i = cases.length;
    let candidate = `case_${i}`;
    while (cases.includes(candidate)) {
      i += 1;
      candidate = `case_${i}`;
    }
    updateCases([...cases, candidate]);
  };

  const seen = new Set<string>();
  const validation: Array<string | null> = cases.map((c) => {
    if (c.length === 0) return t("template.stepInspector.validation.emptyLabel");
    if (!CASE_NAME_RE.test(c))
      return t("template.stepInspector.validation.mustMatch", { pattern: String(CASE_NAME_RE) });
    if (seen.has(c)) return t("template.stepInspector.validation.duplicate");
    seen.add(c);
    return null;
  });

  return (
    <>
      <FormField
        label={t("template.stepInspector.branch.verdictKind.label")}
        description={t("template.stepInspector.branch.verdictKind.description")}
      >
        <Select
          value={inputKind}
          onChange={(e) => setConfig({ inputKind: e.target.value })}
        >
          <option value="Markdown">{t("template.stepInspector.branch.verdictKind.markdownOption")}</option>
        </Select>
      </FormField>

      <FormField
        label={t("template.stepInspector.branch.cases.label")}
        description={t("template.stepInspector.branch.cases.description")}
      >
        <div className="flex flex-col gap-1.5">
          {cases.map((c, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono text-xs"
                  value={c}
                  onChange={(e) => setCase(i, e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCase(i)}
                  disabled={cases.length <= 2}
                >
                  {t("common.delete")}
                </Button>
              </div>
              {validation[i] ? (
                <span className="text-2xs text-destructive">
                  {validation[i]}
                </span>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addCase}
            className="self-start"
          >
            {t("template.stepInspector.branch.cases.add")}
          </Button>
        </div>
      </FormField>
    </>
  );
};

type JsonTransformsEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

type JsonTransformDraft = { port: string; expression: string };

/**
 * Inline editor for `json.transform.transformations`. Each entry materializes
 * one output port (kind Json) carrying the matches of `expression` against the
 * upstream JSON. Order is preserved so the canvas handles match the editor.
 */
const JsonTransformsEditor = ({
  config,
  setConfig,
}: JsonTransformsEditorProps) => {
  const t = useT();
  const raw = config["transformations"];
  const items: JsonTransformDraft[] = Array.isArray(raw)
    ? raw
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({
          port: typeof t.port === "string" ? t.port : "",
          expression: typeof t.expression === "string" ? t.expression : "",
        }))
    : [];

  const update = (next: JsonTransformDraft[]) =>
    setConfig({ transformations: next });

  const setItem = (index: number, patch: Partial<JsonTransformDraft>) => {
    const next = items.map((it, i) =>
      i === index ? { ...it, ...patch } : it,
    );
    update(next);
  };
  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    update(items.filter((_, i) => i !== index));
  };
  const addItem = () => {
    let n = items.length;
    let candidate = `out_${n}`;
    const used = new Set(items.map((it) => it.port));
    while (used.has(candidate)) {
      n += 1;
      candidate = `out_${n}`;
    }
    update([...items, { port: candidate, expression: "$" }]);
  };

  const seen = new Set<string>();
  const portErrors: Array<string | null> = items.map((it) => {
    if (it.port.length === 0) return t("template.stepInspector.validation.emptyName");
    if (!CASE_NAME_RE.test(it.port))
      return t("template.stepInspector.validation.mustMatch", { pattern: String(CASE_NAME_RE) });
    if (seen.has(it.port)) return t("template.stepInspector.validation.duplicate");
    seen.add(it.port);
    return null;
  });
  const exprErrors: Array<string | null> = items.map((it) =>
    it.expression.length === 0 ? t("template.stepInspector.validation.emptyExpression") : null,
  );

  return (
    <FormField
      label={t("template.stepInspector.jsonTransform.projections.label")}
      description={t("template.stepInspector.jsonTransform.projections.description")}
    >
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Input
                className="w-32 font-mono text-xs"
                placeholder="port"
                value={it.port}
                onChange={(e) => setItem(i, { port: e.target.value })}
              />
              <Input
                className="flex-1 font-mono text-xs"
                placeholder="$.foo.bar[*]"
                value={it.expression}
                onChange={(e) => setItem(i, { expression: e.target.value })}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
              >
                {t("common.delete")}
              </Button>
            </div>
            {portErrors[i] || exprErrors[i] ? (
              <span className="text-2xs text-destructive">
                {[portErrors[i], exprErrors[i]].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addItem}
          className="self-start"
        >
          {t("template.stepInspector.jsonTransform.projections.add")}
        </Button>
      </div>
    </FormField>
  );
};

type FilesLoadSlotsEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

type FilesLoadSlotDraft = {
  port: string;
  subpath: string;
  outputKind: string;
};

/**
 * Inline editor for `files.load.slots`. Each entry materializes one named
 * output port reading the file at `path.resolve(base, subpath)` and exposing it
 * with the chosen text-envelope kind. Order is preserved so the canvas handles
 * match the editor. Mirrors {@link JsonTransformsEditor}, plus a `subpath`
 * column and an `outputKind` select.
 */
const FilesLoadSlotsEditor = ({
  config,
  setConfig,
}: FilesLoadSlotsEditorProps) => {
  const t = useT();
  const raw = config["slots"];
  const items: FilesLoadSlotDraft[] = Array.isArray(raw)
    ? raw
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({
          port: typeof s.port === "string" ? s.port : "",
          subpath: typeof s.subpath === "string" ? s.subpath : "",
          outputKind:
            typeof s.outputKind === "string" ? s.outputKind : "Markdown",
        }))
    : [];

  const update = (next: FilesLoadSlotDraft[]) => setConfig({ slots: next });

  const setItem = (index: number, patch: Partial<FilesLoadSlotDraft>) => {
    const next = items.map((it, i) =>
      i === index ? { ...it, ...patch } : it,
    );
    update(next);
  };
  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    update(items.filter((_, i) => i !== index));
  };
  const addItem = () => {
    let n = items.length;
    let candidate = `out_${n}`;
    const used = new Set(items.map((it) => it.port));
    while (used.has(candidate)) {
      n += 1;
      candidate = `out_${n}`;
    }
    update([
      ...items,
      { port: candidate, subpath: "", outputKind: "Markdown" },
    ]);
  };

  const seen = new Set<string>();
  const portErrors: Array<string | null> = items.map((it) => {
    if (it.port.length === 0)
      return t("template.stepInspector.validation.emptyName");
    if (!CASE_NAME_RE.test(it.port))
      return t("template.stepInspector.validation.mustMatch", {
        pattern: String(CASE_NAME_RE),
      });
    if (seen.has(it.port)) return t("template.stepInspector.validation.duplicate");
    seen.add(it.port);
    return null;
  });
  const subpathErrors: Array<string | null> = items.map((it) =>
    it.subpath.trim().length === 0
      ? t("template.stepInspector.validation.emptySubpath")
      : null,
  );

  return (
    <FormField
      label={t("template.stepInspector.filesLoad.slots.label")}
      description={t("template.stepInspector.filesLoad.slots.description")}
    >
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Input
                className="w-28 font-mono text-xs"
                placeholder={t(
                  "template.stepInspector.filesLoad.slots.portPlaceholder",
                )}
                value={it.port}
                onChange={(e) => setItem(i, { port: e.target.value })}
              />
              <Input
                className="flex-1 font-mono text-xs"
                placeholder={t(
                  "template.stepInspector.filesLoad.slots.subpathPlaceholder",
                )}
                value={it.subpath}
                onChange={(e) => setItem(i, { subpath: e.target.value })}
              />
              <Select
                className="w-28"
                value={it.outputKind}
                onChange={(e) => setItem(i, { outputKind: e.target.value })}
              >
                {FILE_LOAD_OUTPUT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
              >
                {t("common.delete")}
              </Button>
            </div>
            {portErrors[i] || subpathErrors[i] ? (
              <span className="text-2xs text-destructive">
                {[portErrors[i], subpathErrors[i]].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addItem}
          className="self-start"
        >
          {t("template.stepInspector.filesLoad.slots.add")}
        </Button>
      </div>
    </FormField>
  );
};

type BranchMatchTargetEditorProps = {
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

/**
 * Inline editor for the `targetKind: OneOf<A,B,…>` config of a `branch.match`
 * step. The runner consumes a sum-typed artifact and dispatches on its
 * `variantKind` discriminator; each variant materialises one `out_<variant>`
 * port on the canvas (resolved by `resolveNodeSpec`).
 *
 * The editor maintains a list of variant kinds and rebuilds the canonical
 * `OneOf<…>` string on every change. Intermediate invalid states (empty cell,
 * duplicate variant) are written verbatim so the user can finish typing — the
 * inline validation message + the canvas falling back to the base spec are the
 * two affordances that surface "not yet valid".
 */
const BranchMatchTargetEditor = ({
  config,
  setConfig,
}: BranchMatchTargetEditorProps) => {
  const t = useT();
  const { types: artifactSchemas } = useArtifactSchemas();
  const dynamicKinds = artifactSchemas.map((t) => kindForArtifactSchema(t));
  const knownKinds = new Set<string>([...ARTIFACT_KINDS, ...dynamicKinds]);

  const variants = readBranchMatchVariants(config["targetKind"]);

  const writeVariants = (next: ReadonlyArray<string>) => {
    setConfig({ targetKind: encodeOneOf(next) });
  };

  const setVariant = (index: number, value: string) => {
    const next = [...variants];
    next[index] = value;
    writeVariants(next);
  };
  const removeVariant = (index: number) => {
    if (variants.length <= 2) return;
    writeVariants(variants.filter((_, i) => i !== index));
  };
  const addVariant = () => {
    if (variants.length >= MAX_SUM_VARIANTS) return;
    writeVariants([...variants, ""]);
  };

  const seen = new Set<string>();
  const validation: Array<string | null> = variants.map((v) => {
    if (v.length === 0) return t("template.stepInspector.validation.emptyVariant");
    if (seen.has(v)) return t("template.stepInspector.validation.duplicate");
    seen.add(v);
    return null;
  });

  return (
    <FormField
      label={t("template.stepInspector.branchMatch.sumType.label")}
      description={
        <Trans
          t={t}
          i18nKey="template.stepInspector.branchMatch.sumType.description"
          values={{ variantPort: "out_<variant>", max: MAX_SUM_VARIANTS }}
          components={{ code: <code /> }}
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        {variants.map((v, i) => {
          const showCurrentOption = v.length > 0 && !knownKinds.has(v);
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Select
                  value={v}
                  onChange={(e) => setVariant(i, e.target.value)}
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
                    <option value={v}>{t("template.stepInspector.kindSelect.orphan", { kind: v })}</option>
                  ) : null}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeVariant(i)}
                  disabled={variants.length <= 2}
                >
                  {t("common.delete")}
                </Button>
              </div>
              {validation[i] ? (
                <span className="text-2xs text-destructive">
                  {validation[i]}
                </span>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addVariant}
          disabled={variants.length >= MAX_SUM_VARIANTS}
          className="self-start"
        >
          {t("template.stepInspector.branchMatch.addVariant")}
        </Button>
      </div>
    </FormField>
  );
};

/**
 * Tolerant read of a `branch.match.targetKind`: returns the parsed variants
 * when the encoding is valid, otherwise tries a shallow split at top level
 * so that intermediate edits (empty cell, duplicate) round-trip through the
 * editor. Falls back to two empty slots when the field is missing — the
 * minimum a `OneOf<…>` admits.
 */
const readBranchMatchVariants = (raw: unknown): string[] => {
  if (typeof raw !== "string" || raw.length === 0) return ["", ""];
  if (isSumArtifactKind(raw)) {
    const parsed = parseSumArtifactKind(raw);
    if (parsed) return [...parsed];
    const inner = raw.slice("OneOf<".length, -1);
    return splitTopLevel(inner);
  }
  return ["", ""];
};

/**
 * Split a comma-separated `OneOf<…>` body at top-level commas, respecting
 * nested chevrons. Mirror of the private helper in `artifact-kind-grammar.ts`
 * — kept local so the editor can read malformed-but-recoverable intermediate
 * states (the strict parser refuses them outright).
 */
const splitTopLevel = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  while (parts.length < 2) parts.push("");
  return parts;
};

const encodeOneOf = (variants: ReadonlyArray<string>): string =>
  `OneOf<${variants.join(",")}>`;

export default StepInspector;
