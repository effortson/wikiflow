export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  code:
    | "cycle_detected"
    | "missing_node"
    | "dangling_edge"
    | "unknown_node_type"
    | "subworkflow_not_found"
    | "duplicate_workflow_id"
    | "port_mismatch"
    | "schema_invalid";
  message: string;
  nodeId?: string;
  workflowRef?: string;
}
