import { makeListTasks } from "../../application/use-cases/list-tasks";
import { makeStartWorkflow } from "../../application/use-cases/start-workflow";
import { makeValidateStep } from "../../application/use-cases/validate-step";
import { makeRequestLoop } from "../../application/use-cases/request-loop";
import { makeRequestRerun } from "../../application/use-cases/request-rerun";
import { makeSubscribeWorkflow } from "../../application/use-cases/subscribe-workflow";
import { makeGetWorkflowTimeline } from "../../application/use-cases/get-workflow-timeline";
import { makeGetRunTokenUsage } from "../../application/use-cases/get-run-token-usage";
import { makeGetWorkflowTemplate } from "../../application/use-cases/get-workflow-template";
import { makeListWorkflowTemplates } from "../../application/use-cases/list-workflow-templates";
import { makeListNodeSpecs } from "../../application/use-cases/list-node-specs";
import { makeSaveWorkflowTemplate } from "../../application/use-cases/save-workflow-template";
import { makeRenameWorkflowTemplate } from "../../application/use-cases/rename-workflow-template";
import { makeDeleteWorkflowTemplate } from "../../application/use-cases/delete-workflow-template";
import { makeGetTemplateLayout } from "../../application/use-cases/get-template-layout";
import { makeSaveTemplateLayout } from "../../application/use-cases/save-template-layout";
import { makeListSkills } from "../../application/use-cases/list-skills";
import { makeSaveSkill } from "../../application/use-cases/save-skill";
import { makeDeleteSkill } from "../../application/use-cases/delete-skill";
import { makeDebugStep } from "../../application/use-cases/debug-step";
import { makeGetArtifact } from "../../application/use-cases/get-artifact";
import { makeGetLlmSession } from "../../application/use-cases/get-llm-session";
import { makeListInstances } from "../../application/use-cases/list-instances";
import { makeListAwaitingHuman } from "../../application/use-cases/list-awaiting-human";
import { makeSearchInstances } from "../../application/use-cases/search-instances";
import { makeDeleteInstance } from "../../application/use-cases/delete-instance";
import { makeGetLinearApiKeyStatus } from "../../application/use-cases/get-linear-api-key-status";
import { makeSetLinearApiKey } from "../../application/use-cases/set-linear-api-key";
import { makeClearLinearApiKey } from "../../application/use-cases/clear-linear-api-key";
import { makeGetGitLabTokenStatus } from "../../application/use-cases/get-gitlab-token-status";
import { makeSetGitLabAccessToken } from "../../application/use-cases/set-gitlab-access-token";
import { makeClearGitLabAccessToken } from "../../application/use-cases/clear-gitlab-access-token";
import { makePickDirectory } from "../../application/use-cases/pick-directory";
import { makePickFile } from "../../application/use-cases/pick-file";
import { makeSaveTextFile } from "../../application/use-cases/save-text-file";
import { makeOpenExternalUrl } from "../../application/use-cases/open-external-url";
import { makeListArtifactSchemas } from "../../application/use-cases/list-artifact-schemas";
import { makeValidateArtifact } from "../../application/use-cases/validate-artifact";
import { makeSaveArtifactSchema } from "../../application/use-cases/save-artifact-schema";
import { makeDeleteArtifactSchema } from "../../application/use-cases/delete-artifact-schema";
import { makeListParsers } from "../../application/use-cases/list-parsers";
import { makeSaveParser } from "../../application/use-cases/save-parser";
import { makeDeleteParser } from "../../application/use-cases/delete-parser";
import { makeRunParser } from "../../application/use-cases/run-parser";
import { makeListStepKindSuggestions } from "../../application/use-cases/list-step-kind-suggestions";
import { makeListPlugins } from "../../application/use-cases/list-plugins";
import { makeListPluginPermissions } from "../../application/use-cases/list-plugin-permissions";
import { makeInvokePlugin } from "../../application/use-cases/invoke-plugin";
import { makeGrantPlugin } from "../../application/use-cases/grant-plugin";
import { makeSetPluginPermission } from "../../application/use-cases/set-plugin-permission";
import { makeSetPluginEnabled } from "../../application/use-cases/set-plugin-enabled";
import { makeReloadPlugin } from "../../application/use-cases/reload-plugin";
import { makeOpenPluginFolder } from "../../application/use-cases/open-plugin-folder";
import { makeListPluginEndpoints } from "../../application/use-cases/list-plugin-endpoints";
import { makeExportWorkflowTemplate } from "../../application/use-cases/export-workflow-template";
import { makeImportWorkflowTemplate } from "../../application/use-cases/import-workflow-template";
import { makeExportRun } from "../../application/use-cases/export-run";
import { makeListSchedules } from "../../application/use-cases/list-schedules";
import { makeSaveSchedule } from "../../application/use-cases/save-schedule";
import { makeSetScheduleEnabled } from "../../application/use-cases/set-schedule-enabled";
import { makeDeleteSchedule } from "../../application/use-cases/delete-schedule";
import { createElectronWorkflowGateway } from "../../infrastructure/electron/electron-workflow-gateway";
import { createElectronSettingsGateway } from "../../infrastructure/electron/electron-settings-gateway";
import { createElectronSystemGateway } from "../../infrastructure/electron/electron-system-gateway";
import { createElectronPluginGateway } from "../../infrastructure/electron/electron-plugin-gateway";
import { createElectronFolderGateway } from "../../infrastructure/electron/electron-folder-gateway";
import { createElectronChatGateway } from "../../infrastructure/electron/electron-chat-gateway";
import { createElectronDevLogGateway } from "../../infrastructure/electron/electron-dev-log-gateway";
import { createMockTaskRepository } from "../../infrastructure/mock/mock-task-repository";
import type { Services } from "./services";

export const buildServices = (): Services => {
  const taskRepository = createMockTaskRepository();
  const workflowGateway = createElectronWorkflowGateway();
  const settingsGateway = createElectronSettingsGateway();
  const systemGateway = createElectronSystemGateway();
  const pluginGateway = createElectronPluginGateway();
  const folderGateway = createElectronFolderGateway();
  const chatGateway = createElectronChatGateway();
  const devLogGateway = createElectronDevLogGateway();
  return {
    listTasks: makeListTasks(taskRepository),
    startWorkflow: makeStartWorkflow(workflowGateway),
    validateStep: makeValidateStep(workflowGateway),
    requestLoop: makeRequestLoop(workflowGateway),
    requestRerun: makeRequestRerun(workflowGateway),
    subscribeWorkflow: makeSubscribeWorkflow(workflowGateway),
    getWorkflowTimeline: makeGetWorkflowTimeline(workflowGateway),
    getRunTokenUsage: makeGetRunTokenUsage(workflowGateway),
    getWorkflowTemplate: makeGetWorkflowTemplate(workflowGateway),
    listWorkflowTemplates: makeListWorkflowTemplates(workflowGateway),
    listNodeSpecs: makeListNodeSpecs(workflowGateway),
    saveWorkflowTemplate: makeSaveWorkflowTemplate(workflowGateway),
    renameWorkflowTemplate: makeRenameWorkflowTemplate(workflowGateway),
    deleteWorkflowTemplate: makeDeleteWorkflowTemplate(workflowGateway),
    exportWorkflowTemplate: makeExportWorkflowTemplate({
      workflows: workflowGateway,
      system: systemGateway,
    }),
    importWorkflowTemplate: makeImportWorkflowTemplate({
      workflows: workflowGateway,
      system: systemGateway,
    }),
    getTemplateLayout: makeGetTemplateLayout(workflowGateway),
    saveTemplateLayout: makeSaveTemplateLayout(workflowGateway),
    listSkills: makeListSkills(workflowGateway),
    saveSkill: makeSaveSkill(workflowGateway),
    deleteSkill: makeDeleteSkill(workflowGateway),
    getArtifact: makeGetArtifact(workflowGateway),
    debugStep: makeDebugStep(workflowGateway),
    getLlmSession: makeGetLlmSession(workflowGateway),
    listInstances: makeListInstances(workflowGateway),
    listAwaitingHuman: makeListAwaitingHuman(workflowGateway),
    searchInstances: makeSearchInstances(workflowGateway),
    deleteInstance: makeDeleteInstance(workflowGateway),
    exportRun: makeExportRun({ workflows: workflowGateway, system: systemGateway }),
    getLinearApiKeyStatus: makeGetLinearApiKeyStatus(settingsGateway),
    setLinearApiKey: makeSetLinearApiKey(settingsGateway),
    clearLinearApiKey: makeClearLinearApiKey(settingsGateway),
    getGitLabTokenStatus: makeGetGitLabTokenStatus(settingsGateway),
    setGitLabAccessToken: makeSetGitLabAccessToken(settingsGateway),
    clearGitLabAccessToken: makeClearGitLabAccessToken(settingsGateway),
    pickDirectory: makePickDirectory(systemGateway),
    pickFile: makePickFile(systemGateway),
    saveTextFile: makeSaveTextFile(systemGateway),
    openExternalUrl: makeOpenExternalUrl(systemGateway),
    listArtifactSchemas: makeListArtifactSchemas(workflowGateway),
    validateArtifact: makeValidateArtifact(workflowGateway),
    saveArtifactSchema: makeSaveArtifactSchema(workflowGateway),
    deleteArtifactSchema: makeDeleteArtifactSchema(workflowGateway),
    listParsers: makeListParsers(workflowGateway),
    saveParser: makeSaveParser(workflowGateway),
    deleteParser: makeDeleteParser(workflowGateway),
    runParser: makeRunParser(workflowGateway),
    listStepKindSuggestions: makeListStepKindSuggestions(workflowGateway),
    listPlugins: makeListPlugins(pluginGateway),
    listPluginPermissions: makeListPluginPermissions(pluginGateway),
    invokePlugin: makeInvokePlugin(pluginGateway),
    grantPlugin: makeGrantPlugin(pluginGateway),
    setPluginPermission: makeSetPluginPermission(pluginGateway),
    setPluginEnabled: makeSetPluginEnabled(pluginGateway),
    reloadPlugin: makeReloadPlugin(pluginGateway),
    openPluginFolder: makeOpenPluginFolder(pluginGateway),
    listPluginEndpoints: makeListPluginEndpoints(pluginGateway),
    listSchedules: makeListSchedules(workflowGateway),
    saveSchedule: makeSaveSchedule(workflowGateway),
    setScheduleEnabled: makeSetScheduleEnabled(workflowGateway),
    deleteSchedule: makeDeleteSchedule(workflowGateway),
    pluginGateway,
    workflowGateway,
    folderGateway,
    settingsGateway,
    windowControls: systemGateway.window,
    chatGateway,
    devLogGateway,
  };
};
