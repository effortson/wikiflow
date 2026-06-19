import type { ValidationResult } from "./validation";

export type WorkflowPortType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "file"
  | "any";

export interface WorkflowPort {
  type: WorkflowPortType;
  description?: string;
  required?: boolean;
}

export type WorkflowPortSchema = Record<string, WorkflowPort>;

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export interface WorkflowDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, unknown>;
  inputs?: WorkflowPortSchema;
  outputs?: WorkflowPortSchema;
}

export interface ValidateOptions {
  resolveSubworkflows?: boolean;
}

export interface RunOptions {
  parentRunId?: string;
  depth?: number;
  inheritedVariables?: Record<string, unknown>;
}

export interface RunReport {
  runId: string;
  rootRunId: string;
  parentRunId?: string;
  depth: number;
  workflowId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  childRuns?: RunReport[];
  outputs?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface WorkflowService {
  load(definitionPath: string): Promise<WorkflowDefinition>;
  validate(
    def: WorkflowDefinition,
    options?: ValidateOptions,
  ): Promise<ValidationResult>;
  run(
    def: WorkflowDefinition,
    inputs?: Record<string, unknown>,
    options?: RunOptions,
  ): Promise<RunReport>;
  cancel(runId: string): boolean;
}

export type { ValidationResult };
