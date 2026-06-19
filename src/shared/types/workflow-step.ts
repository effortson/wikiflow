export type WorkflowStepPhase = "started" | "completed" | "failed";

export interface WorkflowStepEvent {
  runId: string;
  rootRunId: string;
  workflowId: string;
  nodeId: string;
  nodeType: string;
  phase: WorkflowStepPhase;
  inputs?: Record<string, unknown>;
  config?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowNodeRunSnapshot {
  nodeType: string;
  phase: WorkflowStepPhase;
  inputs?: Record<string, unknown>;
  config?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}
