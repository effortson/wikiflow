import type { RunReport, ValidateOptions, WorkflowDefinition } from "@shared/types/workflow";
import type { WorkflowStepEvent } from "@shared/types/workflow-step";
import type { ValidationResult } from "@shared/types/validation";
import type { UserInputModalOptions } from "./user-input-modal";

export interface WorkflowEditorDeps {
  workflowsFolder: string;
  activeWikiId?: string;
  loadWorkflow(path: string): Promise<WorkflowDefinition>;
  saveWorkflow(path: string, def: WorkflowDefinition): Promise<void>;
  validate(
    def: WorkflowDefinition,
    options?: ValidateOptions,
  ): Promise<ValidationResult>;
  run(
    def: WorkflowDefinition,
    inputs?: Record<string, unknown>,
  ): Promise<RunReport>;
  cancel(runId: string): boolean;
  listWorkflowFiles(): string[];
  listWikiIds(): string[];
  notify?(message: string): void;
  promptUserInput(options: UserInputModalOptions): Promise<string | null>;
  subscribeWorkflowDone(handler: (report: RunReport) => void): () => void;
  subscribeWorkflowStarted?(
    handler: (payload: {
      runId: string;
      workflowId: string;
      rootRunId: string;
    }) => void,
  ): () => void;
  subscribeWorkflowStep?(handler: (step: WorkflowStepEvent) => void): () => void;
}
