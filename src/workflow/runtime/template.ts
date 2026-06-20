const TEMPLATE_RE = /^\{\{([^}]+)\}\}$/;
const INLINE_TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

export class TemplateResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateResolutionError";
  }
}

function getPathValue(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      throw new TemplateResolutionError(
        `Cannot read "${part}" on ${String(current)}`,
      );
    }
    if (typeof current !== "object") {
      throw new TemplateResolutionError(
        `Cannot read "${part}" on non-object value`,
      );
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Resolve dotted path under a node's output bag. `output` alone returns the full bag. */
export function resolveNodeOutputPath(
  nodeId: string,
  path: string,
  variables: Map<string, unknown>,
): unknown {
  if (!variables.has(nodeId)) {
    throw new TemplateResolutionError(`Unknown node output "${nodeId}"`);
  }
  const bag = variables.get(nodeId);
  if (!path || path === "output") {
    return bag;
  }
  return getPathValue(bag, path);
}

function resolvePathReference(
  path: string,
  variables: Map<string, unknown>,
): unknown {
  const trimmed = path.trim();
  const dotIndex = trimmed.indexOf(".");
  if (dotIndex === -1) {
    if (!variables.has(trimmed)) {
      throw new TemplateResolutionError(`Unknown variable "${trimmed}"`);
    }
    return variables.get(trimmed);
  }

  const root = trimmed.slice(0, dotIndex);
  const rest = trimmed.slice(dotIndex + 1);
  if (!variables.has(root)) {
    throw new TemplateResolutionError(`Unknown variable "${root}"`);
  }
  return resolveNodeOutputPath(root, rest, variables);
}

function formatInterpolatedValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function resolveInterpolatedTemplate(
  value: string,
  variables: Map<string, unknown>,
): string {
  return value.replace(INLINE_TEMPLATE_RE, (_match, path: string) =>
    formatInterpolatedValue(resolvePathReference(path, variables)),
  );
}

/** Resolve templates: whole-string `{{var}}` returns raw value; mixed text interpolates. */
export function resolveTemplate(
  value: unknown,
  variables: Map<string, unknown>,
): unknown {
  if (typeof value !== "string") return value;

  const match = value.match(TEMPLATE_RE);
  if (match) {
    return resolvePathReference(match[1], variables);
  }

  if (value.includes("{{")) {
    return resolveInterpolatedTemplate(value, variables);
  }

  return value;
}

export function resolveRecord(
  record: Record<string, unknown>,
  variables: Map<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = resolveTemplate(value, variables);
  }
  return out;
}

export type BranchOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "empty";

export interface BranchIfConfig {
  left: string;
  operator: BranchOperator;
  right?: string | number | boolean;
}

export function evaluateBranchIf(
  config: BranchIfConfig,
  variables: Map<string, unknown>,
): boolean {
  const left = resolveTemplate(config.left, variables);

  switch (config.operator) {
    case "exists":
      return left !== undefined && left !== null;
    case "empty":
      if (left === undefined || left === null) return true;
      if (typeof left === "string") return left.length === 0;
      if (Array.isArray(left)) return left.length === 0;
      return false;
    default: {
      const right =
        config.right !== undefined
          ? resolveTemplate(config.right, variables)
          : undefined;
      return compareBranchValues(left, right, config.operator);
    }
  }
}

function compareBranchValues(
  left: unknown,
  right: unknown,
  operator: Exclude<BranchOperator, "exists" | "empty">,
): boolean {
  if (
    typeof left !== typeof right &&
    !(typeof left === "number" && typeof right === "string") &&
    !(typeof left === "string" && typeof right === "number")
  ) {
    return false;
  }

  const l = left as string | number | boolean;
  const r = right as string | number | boolean;

  switch (operator) {
    case "eq":
      return looseScalarEquals(l, r);
    case "neq":
      return !looseScalarEquals(l, r);
    case "gt":
      return l > r;
    case "gte":
      return l >= r;
    case "lt":
      return l < r;
    case "lte":
      return l <= r;
    default:
      return false;
  }
}

/**
 * Equality that treats a number and its string form as equal (e.g. 5 and "5").
 * Branch `right` operands are authored as strings in the UI, while a templated
 * `left` resolves to its raw type, so strict === would wrongly fail numeric
 * comparisons. Ordering operators already coerce via JS `<`/`>`.
 */
function looseScalarEquals(
  l: string | number | boolean,
  r: string | number | boolean,
): boolean {
  if (typeof l === typeof r) return l === r;
  return String(l) === String(r);
}
