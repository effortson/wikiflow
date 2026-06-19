const NODE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function sanitizeNodeIdDraft(draft: string): string {
  return draft.trim();
}

export function isValidNodeId(id: string): boolean {
  return NODE_ID_RE.test(id);
}

export function defaultNodeId(
  nodeType: string,
  existingIds: Set<string>,
): string {
  const base = nodeType.replace(/\./g, "-");
  if (!existingIds.has(base)) return base;
  let index = 2;
  while (existingIds.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

export function resolveNodeId(
  nodeType: string,
  draft: string,
  existingIds: Set<string>,
  currentId?: string,
): { id: string; error?: string } {
  const trimmed = sanitizeNodeIdDraft(draft);
  if (!trimmed) {
    return { id: defaultNodeId(nodeType, existingIds) };
  }
  if (!isValidNodeId(trimmed)) {
    return {
      id: currentId ?? defaultNodeId(nodeType, existingIds),
      error:
        "Node ID must start with a letter and contain only letters, numbers, _ or -",
    };
  }
  if (existingIds.has(trimmed)) {
    return {
      id: currentId ?? trimmed,
      error: `Node ID "${trimmed}" is already in use`,
    };
  }
  return { id: trimmed };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteNodeIdInValue(
  value: unknown,
  oldId: string,
  newId: string,
): unknown {
  if (typeof value === "string") {
    const re = new RegExp(`\\{\\{${escapeRegExp(oldId)}(?=\\.|\\}\\})`, "g");
    return value.replace(re, `{{${newId}`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteNodeIdInValue(item, oldId, newId));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = rewriteNodeIdInValue(nested, oldId, newId);
    }
    return out;
  }
  return value;
}

export function rewriteNodeIdInConfig(
  config: Record<string, unknown>,
  oldId: string,
  newId: string,
): Record<string, unknown> {
  return rewriteNodeIdInValue(config, oldId, newId) as Record<string, unknown>;
}
