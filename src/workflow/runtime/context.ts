import type { BackupService } from "@shared/types/backup";
import type { WikiId } from "@shared/types/wiki-instance";
import type { WorkflowService } from "@shared/types/workflow";
import type { WorkflowStepEvent } from "@shared/types/workflow-step";
import type { CoreServices } from "../../core/core-services";
import type { WikiService } from "../../wiki/service";

export interface WorkflowServices {
  llm: CoreServices["llm"];
  wiki: WikiService;
  vault: CoreServices["vault"];
  jobs: CoreServices["jobs"];
  backup: BackupService;
  workflow: WorkflowService;
}

export interface WorkflowContext {
  runId: string;
  rootRunId: string;
  parentRunId?: string;
  depth: number;
  callStack: string[];
  variables: Map<string, unknown>;
  services: WorkflowServices;
  signal: AbortSignal;
  wikiId?: WikiId;
  /** Root workflow trigger node type (e.g. trigger.manual). */
  triggerType?: string;
  onStep?: (step: WorkflowStepEvent) => void;
}

export interface CreateContextOptions {
  runId: string;
  rootRunId: string;
  parentRunId?: string;
  depth: number;
  workflowId: string;
  callStack?: string[];
  inheritedVariables?: Record<string, unknown>;
  wikiId?: WikiId;
  signal: AbortSignal;
  services: WorkflowServices;
  triggerType?: string;
  onStep?: (step: WorkflowStepEvent) => void;
}

export function createWorkflowContext(
  options: CreateContextOptions,
): WorkflowContext {
  const variables = new Map<string, unknown>();
  if (options.inheritedVariables) {
    for (const [key, value] of Object.entries(options.inheritedVariables)) {
      variables.set(key, value);
    }
  }

  const callStack = options.callStack ?? [];
  if (!callStack.includes(options.workflowId)) {
    callStack.push(options.workflowId);
  }

  return {
    runId: options.runId,
    rootRunId: options.rootRunId,
    parentRunId: options.parentRunId,
    depth: options.depth,
    callStack: [...callStack],
    variables,
    services: options.services,
    signal: options.signal,
    wikiId: options.wikiId,
    triggerType: options.triggerType,
    onStep: options.onStep,
  };
}

export function mergeVariables(
  target: Map<string, unknown>,
  outputs: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(outputs)) {
    target.set(key, value);
  }
}

export function variablesToRecord(
  variables: Map<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(variables.entries());
}
