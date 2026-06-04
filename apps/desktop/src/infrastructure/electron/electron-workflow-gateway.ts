import type { TemplateLayout } from "@shared/wf/layout";
import type { RunExportBundle } from "@shared/wf/run-export";
import type { StepTokenUsage } from "@shared/wf/token-usage";
import type { WorkflowGateway } from "../../application/ports/workflow-gateway";
import type {
  ArtifactContentView,
  ArtifactSchemaView,
  AwaitingHumanItemView,
  ChannelIconImageMimeView,
  ChannelView,
  DebugStepResultView,
  InstanceSummaryView,
  InstanceTreeNodeView,
  InstanceView,
  LlmSessionEvent,
  NodeSpecView,
  ParserView,
  ScheduleView,
  SkillView,
  StepKindSuggestionView,
  TemplateView,
  WfEvent,
} from "../../domain/workflow/types";

export const createElectronWorkflowGateway = (): WorkflowGateway => ({
  async startInstance(input) {
    return window.api.wf.startInstance(input);
  },
  async submitDecision(input) {
    await window.api.wf.submitDecision(input);
  },
  async openLoop(input) {
    await window.api.wf.openLoop(input);
  },
  async getTimeline(instanceId) {
    const raw = (await window.api.wf.getTimeline({ instanceId })) as
      | InstanceView
      | null;
    return raw;
  },
  async getInstanceTree(instanceId) {
    const raw = (await window.api.wf.getInstanceTree({ instanceId })) as
      | InstanceTreeNodeView
      | null;
    return raw;
  },
  async getRunTokenUsage(instanceId) {
    const raw = (await window.api.wf.getRunTokenUsage({
      instanceId,
    })) as ReadonlyArray<StepTokenUsage>;
    return raw;
  },
  async getTemplate(templateRef) {
    const raw = (await window.api.wf.getTemplate({ templateRef })) as TemplateView;
    return raw;
  },
  async listTemplates() {
    const raw = (await window.api.wf.listTemplates()) as ReadonlyArray<TemplateView>;
    return raw;
  },
  async listNodeSpecs() {
    return window.api.wf.listNodeSpecs() as Promise<ReadonlyArray<NodeSpecView>>;
  },
  async saveTemplate(tpl) {
    await window.api.wf.saveTemplate(tpl);
  },
  async renameTemplate(input) {
    await window.api.wf.renameTemplate(input);
  },
  async deleteTemplate(templateRef) {
    await window.api.wf.deleteTemplate({ templateRef });
  },
  async getTemplateLayout(templateRef) {
    const raw = (await window.api.wf.getTemplateLayout({ templateRef })) as
      | TemplateLayout
      | null;
    return raw;
  },
  async saveTemplateLayout(templateRef, layout) {
    await window.api.wf.saveTemplateLayout({ templateRef, layout });
  },
  async listSkills() {
    const raw = (await window.api.wf.listSkills()) as ReadonlyArray<SkillView>;
    return raw;
  },
  async saveSkill(skill) {
    await window.api.wf.saveSkill(skill);
  },
  async deleteSkill(ref) {
    await window.api.wf.deleteSkill({ ref });
  },
  async getArtifact(artifactId) {
    const raw = (await window.api.wf.getArtifact({ artifactId })) as ArtifactContentView;
    return raw;
  },
  async listInstances() {
    const raw = (await window.api.wf.listInstances()) as ReadonlyArray<InstanceSummaryView>;
    return raw;
  },
  async listAwaitingHuman() {
    const raw =
      (await window.api.wf.listAwaitingHuman()) as ReadonlyArray<AwaitingHumanItemView>;
    return raw;
  },
  async searchInstances(query) {
    const raw = (await window.api.wf.searchInstances({ query })) as ReadonlyArray<InstanceSummaryView>;
    return raw;
  },
  async deleteInstance(instanceId) {
    await window.api.wf.deleteInstance({ instanceId });
  },
  async exportRun(instanceId) {
    const raw = (await window.api.wf.exportInstance({ instanceId })) as RunExportBundle;
    return raw;
  },
  onEvent(listener) {
    return window.api.wf.onEvent((payload) => listener(payload as WfEvent));
  },
  onLlmSession(listener) {
    return window.api.wf.onLlmSession((payload) =>
      listener(payload as LlmSessionEvent),
    );
  },
  async getLlmSession(stepExecId) {
    const raw = (await window.api.wf.getLlmSession({ stepExecId })) as ReadonlyArray<LlmSessionEvent>;
    return raw;
  },
  async listArtifactSchemas() {
    const raw =
      (await window.api.wf.listArtifactSchemas()) as ReadonlyArray<ArtifactSchemaView>;
    return raw;
  },
  async validateArtifact(kind, content) {
    return window.api.wf.validateArtifact(kind, content);
  },
  async saveArtifactSchema(type) {
    await window.api.wf.saveArtifactSchema(type);
  },
  async deleteArtifactSchema(ref) {
    await window.api.wf.deleteArtifactSchema(ref);
  },
  async listParsers(forType) {
    const raw = (await window.api.wf.listParsers(
      forType ? { forType } : undefined,
    )) as ReadonlyArray<ParserView>;
    return raw;
  },
  async saveParser(parser) {
    await window.api.wf.saveParser(parser);
  },
  async deleteParser(ref) {
    await window.api.wf.deleteParser(ref);
  },
  async runParser(input) {
    const raw = (await window.api.wf.runParser(input));
    return raw;
  },
  async listStepKindSuggestions(inputKind) {
    const raw = (await window.api.wf.listStepKindSuggestions({
      inputKind,
    })) as ReadonlyArray<StepKindSuggestionView>;
    return raw;
  },
  async listChannels() {
    const raw = (await window.api.wf.channels.list()) as ReadonlyArray<ChannelView>;
    return raw;
  },
  async saveChannel(draft) {
    await window.api.wf.channels.save(draft);
  },
  async deleteChannel(id) {
    await window.api.wf.channels.remove(id);
  },
  async getActiveChannel() {
    return window.api.wf.channels.getActive();
  },
  async setActiveChannel(id) {
    await window.api.wf.channels.setActive(id);
  },
  onChannelChanged(listener) {
    return window.api.wf.channels.onChanged(listener);
  },
  async moveEntity(input) {
    await window.api.wf.channels.moveEntity(input);
  },
  async getChannelIconImage(id) {
    const raw = (await window.api.wf.channels.getIconImage(id)) as
      | { bytes: Uint8Array; mime: ChannelIconImageMimeView }
      | null;
    return raw;
  },
  async debugStep(input) {
    const raw = (await window.api.wf.debugStep(input)) as DebugStepResultView;
    return raw;
  },
  async listSchedules() {
    const raw = (await window.api.wf.schedules.list()) as ReadonlyArray<ScheduleView>;
    return raw;
  },
  async saveSchedule(draft) {
    const raw = (await window.api.wf.schedules.save(draft)) as ScheduleView;
    return raw;
  },
  async setScheduleEnabled(id, enabled) {
    await window.api.wf.schedules.setEnabled({ id, enabled });
  },
  async deleteSchedule(id) {
    await window.api.wf.schedules.remove(id);
  },
});
