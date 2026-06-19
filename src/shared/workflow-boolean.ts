/** Coerce workflow node config values from UI selects ("true"/"false") or booleans. */
export function isWorkflowTruthy(value: unknown): boolean {
  return value === true || value === "true";
}

export function isWorkflowFalsy(value: unknown): boolean {
  return value === false || value === "false";
}
