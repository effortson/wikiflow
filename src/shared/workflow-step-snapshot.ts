const MAX_STRING = 4000;
const MAX_ARRAY = 30;
const MAX_DEPTH = 8;

function isTFileLike(value: object): value is {
  path: string;
  basename?: string;
  extension?: string;
} {
  return (
    "path" in value &&
    typeof (value as { path: unknown }).path === "string" &&
    "extension" in value
  );
}

function isNormalizedDocumentLike(value: object): value is {
  title: string;
  sourceId: string;
  wikiId: string;
  chunks?: unknown[];
  fullText?: string;
} {
  return (
    "sourceId" in value &&
    "wikiId" in value &&
    "title" in value &&
    "chunks" in value
  );
}

function isRunReportLike(value: object): value is {
  runId: string;
  workflowId: string;
  status: string;
} {
  return (
    "runId" in value &&
    "workflowId" in value &&
    "status" in value &&
    !("nodeId" in value)
  );
}

export function snapshotWorkflowValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[max depth]";

  if (typeof value === "string") {
    return value.length <= MAX_STRING
      ? value
      : `${value.slice(0, MAX_STRING)}… (${value.length} chars)`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") return value.toString();

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of value.entries()) {
      out[String(key)] = snapshotWorkflowValue(entry, depth + 1);
    }
    return out;
  }

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY).map((item) =>
      snapshotWorkflowValue(item, depth + 1),
    );
    if (value.length > MAX_ARRAY) {
      sliced.push(`… +${value.length - MAX_ARRAY} more items`);
    }
    return sliced;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (isTFileLike(obj)) {
      return {
        __type: "TFile",
        path: obj.path,
        name: obj.basename ?? obj.path.split("/").pop(),
        extension: obj.extension,
      };
    }

    if (isNormalizedDocumentLike(obj)) {
      return {
        __type: "NormalizedDocument",
        title: obj.title,
        sourceId: obj.sourceId,
        wikiId: obj.wikiId,
        chunkCount: Array.isArray(obj.chunks) ? obj.chunks.length : 0,
        textPreview:
          typeof obj.fullText === "string"
            ? snapshotWorkflowValue(obj.fullText.slice(0, 500), depth + 1)
            : undefined,
      };
    }

    if (isRunReportLike(obj)) {
      return {
        __type: "RunReport",
        runId: obj.runId,
        workflowId: obj.workflowId,
        status: obj.status,
      };
    }

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      if (key === "__childRun") {
        out[key] = snapshotWorkflowValue(entry, depth + 1);
        continue;
      }
      out[key] = snapshotWorkflowValue(entry, depth + 1);
    }
    return out;
  }

  return String(value);
}

export function snapshotWorkflowRecord(
  record: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!record) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = snapshotWorkflowValue(value);
  }
  return out;
}

export function formatWorkflowRecordJson(
  record: Record<string, unknown> | undefined,
): string {
  if (!record || Object.keys(record).length === 0) return "{}";
  try {
    return JSON.stringify(record, null, 2);
  } catch {
    return String(record);
  }
}
