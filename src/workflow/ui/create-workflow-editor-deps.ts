import type { WorkflowDefinition } from "@shared/types/workflow";
import type { WorkflowEditorDeps } from "./workflow-editor-deps";
import type { WorkflowViewHost } from "./workflow-view";
import { showNotice } from "../../ui/notice";
import { promptUserInput } from "./user-input-modal";

export function createWorkflowEditorDeps(
  host: WorkflowViewHost,
): WorkflowEditorDeps {
  return {
    workflowsFolder: host.settings.workflowsFolder,
    activeWikiId: host.settings.activeWikiId,
    loadWorkflow: (path) => host.workflow.load(path),
    saveWorkflow: (path, def) =>
      host.core.vault.writeText(path, JSON.stringify(def, null, 2)),
    validate: (def, options) => host.workflow.validate(def, options),
    run: (def, inputs) => host.workflow.run(def, inputs ?? {}),
    cancel: (runId) => host.workflow.cancel(runId),
    listWorkflowFiles: () =>
      host.app.vault
        .getFiles()
        .filter((f) => f.path.endsWith(".workflow.json"))
        .map((f) => f.path)
        .sort(),
    listWikiIds: () => host.getWikiInstances().map((w) => w.wikiId),
    notify: (message) => showNotice(message),
    promptUserInput: (options) => promptUserInput(host.app, options),
    subscribeWorkflowDone: (handler) =>
      host.core.events.subscribe("workflow:done", handler),
    subscribeWorkflowStarted: (handler) =>
      host.core.events.subscribe("workflow:started", handler),
    subscribeWorkflowStep: (handler) =>
      host.core.events.subscribe("workflow:step", handler),
  };
}

export type { WorkflowDefinition };
