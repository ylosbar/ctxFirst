import type { ListTasks } from "../../application/use-cases/list-tasks";
import type { StartWorkflow } from "../../application/use-cases/start-workflow";
import type { ValidateStep } from "../../application/use-cases/validate-step";
import type { RequestLoop } from "../../application/use-cases/request-loop";
import type { SubscribeWorkflow } from "../../application/use-cases/subscribe-workflow";
import type { GetWorkflowTimeline } from "../../application/use-cases/get-workflow-timeline";
import type { GetRunTokenUsage } from "../../application/use-cases/get-run-token-usage";
import type { GetWorkflowTemplate } from "../../application/use-cases/get-workflow-template";
import type { ListWorkflowTemplates } from "../../application/use-cases/list-workflow-templates";
import type { ListNodeSpecs } from "../../application/use-cases/list-node-specs";
import type { SaveWorkflowTemplate } from "../../application/use-cases/save-workflow-template";
import type { RenameWorkflowTemplate } from "../../application/use-cases/rename-workflow-template";
import type { DeleteWorkflowTemplate } from "../../application/use-cases/delete-workflow-template";
import type { GetTemplateLayout } from "../../application/use-cases/get-template-layout";
import type { SaveTemplateLayout } from "../../application/use-cases/save-template-layout";
import type { ListSkills } from "../../application/use-cases/list-skills";
import type { SaveSkill } from "../../application/use-cases/save-skill";
import type { DeleteSkill } from "../../application/use-cases/delete-skill";
import type { DebugStep } from "../../application/use-cases/debug-step";
import type { GetArtifact } from "../../application/use-cases/get-artifact";
import type { GetLlmSession } from "../../application/use-cases/get-llm-session";
import type { ListInstances } from "../../application/use-cases/list-instances";
import type { ListAwaitingHuman } from "../../application/use-cases/list-awaiting-human";
import type { SearchInstances } from "../../application/use-cases/search-instances";
import type { DeleteInstance } from "../../application/use-cases/delete-instance";
import type { GetLinearApiKeyStatus } from "../../application/use-cases/get-linear-api-key-status";
import type { SetLinearApiKey } from "../../application/use-cases/set-linear-api-key";
import type { ClearLinearApiKey } from "../../application/use-cases/clear-linear-api-key";
import type { GetGitLabTokenStatus } from "../../application/use-cases/get-gitlab-token-status";
import type { SetGitLabAccessToken } from "../../application/use-cases/set-gitlab-access-token";
import type { ClearGitLabAccessToken } from "../../application/use-cases/clear-gitlab-access-token";
import type { PickDirectory } from "../../application/use-cases/pick-directory";
import type { PickFile } from "../../application/use-cases/pick-file";
import type { SaveTextFile } from "../../application/use-cases/save-text-file";
import type { OpenExternalUrl } from "../../application/use-cases/open-external-url";
import type { ListArtifactSchemas } from "../../application/use-cases/list-artifact-schemas";
import type { ValidateArtifact } from "../../application/use-cases/validate-artifact";
import type { SaveArtifactSchema } from "../../application/use-cases/save-artifact-schema";
import type { DeleteArtifactSchema } from "../../application/use-cases/delete-artifact-schema";
import type { ListParsers } from "../../application/use-cases/list-parsers";
import type { SaveParser } from "../../application/use-cases/save-parser";
import type { DeleteParser } from "../../application/use-cases/delete-parser";
import type { RunParser } from "../../application/use-cases/run-parser";
import type { ListStepKindSuggestions } from "../../application/use-cases/list-step-kind-suggestions";
import type { ListPlugins } from "../../application/use-cases/list-plugins";
import type { ListPluginPermissions } from "../../application/use-cases/list-plugin-permissions";
import type { InvokePlugin } from "../../application/use-cases/invoke-plugin";
import type { GrantPlugin } from "../../application/use-cases/grant-plugin";
import type { SetPluginPermission } from "../../application/use-cases/set-plugin-permission";
import type { SetPluginEnabled } from "../../application/use-cases/set-plugin-enabled";
import type { ReloadPlugin } from "../../application/use-cases/reload-plugin";
import type { OpenPluginFolder } from "../../application/use-cases/open-plugin-folder";
import type { ListPluginEndpoints } from "../../application/use-cases/list-plugin-endpoints";
import type { PluginGateway } from "../../application/ports/plugin-gateway";
import type { SettingsGateway } from "../../application/ports/settings-gateway";
import type { SystemGateway } from "../../application/ports/system-gateway";
import type { WorkflowGateway } from "../../application/ports/workflow-gateway";
import type { FolderGateway } from "../../application/ports/folder-gateway";
import type { ChatGateway } from "../../application/ports/chat-gateway";
import type { DevLogGateway } from "../../application/ports/dev-log-gateway";
import type { ExportWorkflowTemplate } from "../../application/use-cases/export-workflow-template";
import type { ImportWorkflowTemplate } from "../../application/use-cases/import-workflow-template";
import type { ExportRun } from "../../application/use-cases/export-run";
import type { ListSchedules } from "../../application/use-cases/list-schedules";
import type { SaveSchedule } from "../../application/use-cases/save-schedule";
import type { SetScheduleEnabled } from "../../application/use-cases/set-schedule-enabled";
import type { DeleteSchedule } from "../../application/use-cases/delete-schedule";

export type Services = {
  listTasks: ListTasks;
  startWorkflow: StartWorkflow;
  validateStep: ValidateStep;
  requestLoop: RequestLoop;
  subscribeWorkflow: SubscribeWorkflow;
  getWorkflowTimeline: GetWorkflowTimeline;
  getRunTokenUsage: GetRunTokenUsage;
  getWorkflowTemplate: GetWorkflowTemplate;
  listWorkflowTemplates: ListWorkflowTemplates;
  listNodeSpecs: ListNodeSpecs;
  saveWorkflowTemplate: SaveWorkflowTemplate;
  renameWorkflowTemplate: RenameWorkflowTemplate;
  deleteWorkflowTemplate: DeleteWorkflowTemplate;
  exportWorkflowTemplate: ExportWorkflowTemplate;
  importWorkflowTemplate: ImportWorkflowTemplate;
  getTemplateLayout: GetTemplateLayout;
  saveTemplateLayout: SaveTemplateLayout;
  listSkills: ListSkills;
  saveSkill: SaveSkill;
  deleteSkill: DeleteSkill;
  getArtifact: GetArtifact;
  debugStep: DebugStep;
  getLlmSession: GetLlmSession;
  listInstances: ListInstances;
  listAwaitingHuman: ListAwaitingHuman;
  searchInstances: SearchInstances;
  deleteInstance: DeleteInstance;
  exportRun: ExportRun;
  getLinearApiKeyStatus: GetLinearApiKeyStatus;
  setLinearApiKey: SetLinearApiKey;
  clearLinearApiKey: ClearLinearApiKey;
  getGitLabTokenStatus: GetGitLabTokenStatus;
  setGitLabAccessToken: SetGitLabAccessToken;
  clearGitLabAccessToken: ClearGitLabAccessToken;
  pickDirectory: PickDirectory;
  pickFile: PickFile;
  saveTextFile: SaveTextFile;
  openExternalUrl: OpenExternalUrl;
  listArtifactSchemas: ListArtifactSchemas;
  validateArtifact: ValidateArtifact;
  saveArtifactSchema: SaveArtifactSchema;
  deleteArtifactSchema: DeleteArtifactSchema;
  listParsers: ListParsers;
  saveParser: SaveParser;
  deleteParser: DeleteParser;
  runParser: RunParser;
  listStepKindSuggestions: ListStepKindSuggestions;
  listPlugins: ListPlugins;
  listPluginPermissions: ListPluginPermissions;
  invokePlugin: InvokePlugin;
  grantPlugin: GrantPlugin;
  setPluginPermission: SetPluginPermission;
  setPluginEnabled: SetPluginEnabled;
  reloadPlugin: ReloadPlugin;
  openPluginFolder: OpenPluginFolder;
  listPluginEndpoints: ListPluginEndpoints;
  listSchedules: ListSchedules;
  saveSchedule: SaveSchedule;
  setScheduleEnabled: SetScheduleEnabled;
  deleteSchedule: DeleteSchedule;
  /**
   * The plugin gateway is exposed alongside the use-cases so
   * non-React code (e.g. the renderer plugin loader) can depend on the port
   * directly, instead of touching `window.api.plugins`.
   */
  pluginGateway: PluginGateway;
  /**
   * Same rationale for the workflow gateway — the ChannelProvider drives a
   * stateful subscription and would otherwise need 6+ thin use-case wrappers.
   */
  workflowGateway: WorkflowGateway;
  /**
   * Same shape as the other gateways — the Explorer drives a stateful
   * subscription on `onChanged` and would gain nothing from wrapping every
   * CRUD verb in a use-case file.
   */
  folderGateway: FolderGateway;
  /**
   * Settings gateway exposed directly so feature panels (OpenRouter, future
   * providers) can read/write without 5+ thin use-case wrappers each. The
   * legacy `getLinearApiKeyStatus`/`setLinearApiKey`/… stay above for
   * back-compat with existing call sites.
   */
  settingsGateway: SettingsGateway;
  /**
   * Frameless window controls (min/max/close + maximized-state subscription).
   * Exposed as a sub-object rather than 4 individual use-cases — the surface
   * is OS-plumbing, not domain logic, and wrapping each call in a one-liner
   * use-case would be pure ceremony.
   */
  windowControls: SystemGateway["window"];
  /**
   * Chat global piloté par Pi. Exposé en gateway direct (pas de use-cases
   * intermédiaires) — la feature `chat` consomme une dizaine de méthodes
   * et un stream d'événements, multiplier les use-case wrappers serait
   * du pur boilerplate. Cohérent avec `settingsGateway` / `workflowGateway`.
   */
  chatGateway: ChatGateway;
  /**
   * Streaming des logs du process main (stdout/stderr en dev + console
   * renderer) vers la vue terminal du bottom dock. Pas de use-case wrapper —
   * un seul `subscribe` + un `getBuffer` au mount, cohérent avec les autres
   * gateways exposés en direct.
   */
  devLogGateway: DevLogGateway;
};
