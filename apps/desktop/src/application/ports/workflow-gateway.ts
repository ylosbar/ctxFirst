import type { TemplateLayout } from "@shared/wf/layout";
import type { RunExportBundle } from "@shared/wf/run-export";
import type { StepTokenUsage } from "@shared/wf/token-usage";
import type {
  ArtifactContentView,
  ArtifactKind,
  ArtifactSchemaRefView,
  ArtifactSchemaView,
  ArtifactValidationResultView,
  AwaitingHumanItemView,
  ChannelDraftView,
  ChannelIconImageMimeView,
  ChannelView,
  DebugStepInputView,
  DebugStepResultView,
  InstanceSummaryView,
  InstanceView,
  LlmSessionEvent,
  MoveEntityInputView,
  NodeSpecView,
  ParserRefView,
  ParserView,
  ReviewCommentView,
  RunParserDraft,
  RunParserResultView,
  SaveArtifactSchemaDraft,
  SaveParserDraft,
  ScheduleDraftView,
  ScheduleView,
  SkillDraft,
  SkillView,
  StepKindSuggestionView,
  TemplateDraft,
  TemplateView,
  WfEvent,
} from "../../domain/workflow/types";

export type Unsubscribe = () => void;

export interface WorkflowGateway {
  startInstance(input: {
    templateRef: string;
    seeds: ReadonlyArray<{ kind: ArtifactKind; content: string }>;
    /** Working directory used by native side-effects of the run (CLI cwd). */
    cwd?: string;
  }): Promise<{ instanceId: string }>;
  submitDecision(input: { instanceId: string; stepExecId: string }): Promise<void>;
  openLoop(input: {
    instanceId: string;
    stepExecId: string;
    toStepId: string;
    reason: string;
    comments?: ReadonlyArray<ReviewCommentView>;
  }): Promise<void>;
  getTimeline(instanceId: string): Promise<InstanceView | null>;
  /** Per-step token / cost totals for a run (aggregated from the LLM run log). */
  getRunTokenUsage(instanceId: string): Promise<ReadonlyArray<StepTokenUsage>>;
  getTemplate(templateRef: string): Promise<TemplateView>;
  listTemplates(): Promise<ReadonlyArray<TemplateView>>;
  listNodeSpecs(): Promise<ReadonlyArray<NodeSpecView>>;
  saveTemplate(tpl: TemplateDraft): Promise<void>;
  renameTemplate(input: { templateRef: string; newName: string }): Promise<void>;
  getTemplateLayout(templateRef: string): Promise<TemplateLayout | null>;
  saveTemplateLayout(templateRef: string, layout: TemplateLayout): Promise<void>;
  listSkills(): Promise<ReadonlyArray<SkillView>>;
  saveSkill(skill: SkillDraft): Promise<void>;
  deleteSkill(ref: string): Promise<void>;
  getArtifact(artifactId: string): Promise<ArtifactContentView>;
  listInstances(): Promise<ReadonlyArray<InstanceSummaryView>>;
  listAwaitingHuman(): Promise<ReadonlyArray<AwaitingHumanItemView>>;
  searchInstances(query: string): Promise<ReadonlyArray<InstanceSummaryView>>;
  deleteInstance(instanceId: string): Promise<void>;
  /** Assembles the full self-contained export bundle for a run. */
  exportRun(instanceId: string): Promise<RunExportBundle>;
  onEvent(listener: (evt: WfEvent) => void): Unsubscribe;
  onLlmSession(listener: (ev: LlmSessionEvent) => void): Unsubscribe;
  getLlmSession(stepExecId: string): Promise<ReadonlyArray<LlmSessionEvent>>;

  // --- Artifact types & parsers (PLUGINS.md §6–§7) ---
  listArtifactSchemas(): Promise<ReadonlyArray<ArtifactSchemaView>>;
  /** Validates a literal content against a kind without storing anything. */
  validateArtifact(
    kind: ArtifactKind,
    content: string,
  ): Promise<ArtifactValidationResultView>;
  saveArtifactSchema(type: SaveArtifactSchemaDraft): Promise<void>;
  deleteArtifactSchema(ref: ArtifactSchemaRefView): Promise<void>;
  listParsers(forType?: ArtifactSchemaRefView): Promise<ReadonlyArray<ParserView>>;
  saveParser(parser: SaveParserDraft): Promise<void>;
  deleteParser(ref: ParserRefView): Promise<void>;
  runParser(input: RunParserDraft): Promise<RunParserResultView>;
  listStepKindSuggestions(
    inputKind: ArtifactKind,
  ): Promise<ReadonlyArray<StepKindSuggestionView>>;

  // --- Channels ---
  listChannels(): Promise<ReadonlyArray<ChannelView>>;
  saveChannel(draft: ChannelDraftView): Promise<void>;
  deleteChannel(id: string): Promise<void>;
  getActiveChannel(): Promise<string>;
  setActiveChannel(id: string): Promise<void>;
  onChannelChanged(listener: (id: string) => void): Unsubscribe;
  moveEntity(input: MoveEntityInputView): Promise<void>;
  /** Renvoie les octets bruts de l'image uploadée pour ce channel, ou `null`. */
  getChannelIconImage(
    id: string,
  ): Promise<{ bytes: Uint8Array; mime: ChannelIconImageMimeView } | null>;

  // --- Studio (debug node isolée, sans persistance) ---
  debugStep(input: DebugStepInputView): Promise<DebugStepResultView>;

  // --- Schedules (cron triggers) ---
  listSchedules(): Promise<ReadonlyArray<ScheduleView>>;
  saveSchedule(draft: ScheduleDraftView): Promise<ScheduleView>;
  setScheduleEnabled(id: string, enabled: boolean): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
}
