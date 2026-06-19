export type NodeFieldType =
  | "string"
  | "text"
  | "json"
  | "select"
  | "workflow-ref";

export interface NodePortSchema {
  key: string;
  label: string;
  description?: string;
}

export interface NodeFieldSchema {
  key: string;
  label: string;
  type: NodeFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface NodeCatalogEntry {
  type: string;
  label: string;
  category: "trigger" | "wiki" | "flow" | "llm" | "vault" | "output";
  fields: NodeFieldSchema[];
  /** Declared output ports — use {{nodeId.key}} or {{key}} in downstream config. */
  outputs: NodePortSchema[];
}

const BRANCH_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "empty",
].map((op) => ({ value: op, label: op }));

export const NODE_CATALOG: NodeCatalogEntry[] = [
  {
    type: "trigger.manual",
    label: "Manual trigger",
    category: "trigger",
    fields: [],
    outputs: [
      { key: "path", label: "path", description: "Run input path (if provided)" },
      { key: "wikiId", label: "wikiId", description: "Run input wikiId (if provided)" },
    ],
  },
  {
    type: "trigger.file-added",
    label: "File added trigger",
    category: "trigger",
    fields: [
      {
        key: "wikiId",
        label: "Wiki ID (optional)",
        type: "string",
        placeholder: "Leave empty for any wiki",
      },
    ],
    outputs: [
      { key: "path", label: "path", description: "Added file path" },
      { key: "wikiId", label: "wikiId", description: "Resolved wiki id" },
    ],
  },
  {
    type: "trigger.user-input",
    label: "User input trigger",
    category: "trigger",
    fields: [
      {
        key: "prompt",
        label: "Prompt label",
        type: "string",
        required: true,
        placeholder: "请输入你的问题",
      },
    ],
    outputs: [
      { key: "text", label: "text", description: "Run-time prompt text" },
      { key: "input", label: "input", description: "Alias of text" },
    ],
  },
  {
    type: "file.pick",
    label: "Pick file",
    category: "wiki",
    fields: [
      { key: "path", label: "Path template", type: "string", placeholder: "{{path}}" },
      { key: "wikiId", label: "Wiki ID", type: "string", placeholder: "{{wikiId}}" },
    ],
    outputs: [
      { key: "pickedFile", label: "pickedFile", description: "Obsidian TFile" },
      { key: "path", label: "path" },
      { key: "wikiId", label: "wikiId" },
    ],
  },
  {
    type: "doc.extract",
    label: "Extract document",
    category: "wiki",
    fields: [{ key: "wikiId", label: "Wiki ID", type: "string", placeholder: "{{wikiId}}" }],
    outputs: [{ key: "document", label: "document", description: "NormalizedDocument" }],
  },
  {
    type: "wiki.ingest",
    label: "Wiki ingest",
    category: "wiki",
    fields: [
      {
        key: "wikiId",
        label: "Wiki ID",
        type: "string",
        required: true,
        placeholder: "{{wikiId}}",
      },
    ],
    outputs: [
      { key: "report", label: "report", description: "IngestReport" },
      { key: "ingestReport", label: "ingestReport", description: "Alias of report" },
    ],
  },
  {
    type: "wiki.query",
    label: "Wiki query",
    category: "wiki",
    fields: [
      { key: "wikiId", label: "Wiki ID", type: "string", required: true, placeholder: "{{wikiId}}" },
      { key: "question", label: "Question", type: "text", required: true },
    ],
    outputs: [{ key: "answer", label: "answer" }],
  },
  {
    type: "wiki.query-batch",
    label: "Wiki batch query",
    category: "wiki",
    fields: [
      {
        key: "wikiId",
        label: "Wiki ID",
        type: "string",
        required: true,
        placeholder: "{{wikiId}}",
      },
      {
        key: "questions",
        label: "Questions",
        type: "text",
        required: true,
        placeholder: "{{expand.text}}",
      },
      {
        key: "maxQuestions",
        label: "Max questions",
        type: "string",
        placeholder: "5",
      },
    ],
    outputs: [
      { key: "answers", label: "answers", description: "Answer strings in order" },
      {
        key: "results",
        label: "results",
        description: "Array of { question, answer }",
      },
      {
        key: "combined",
        label: "combined",
        description: "Formatted Q&A text for downstream LLM",
      },
    ],
  },
  {
    type: "llm.chat",
    label: "LLM chat",
    category: "llm",
    fields: [
      { key: "system", label: "System prompt", type: "text" },
      { key: "user", label: "User prompt", type: "text", required: true, placeholder: "{{ingestReport}}" },
    ],
    outputs: [
      { key: "text", label: "text" },
      { key: "summary", label: "summary", description: "Alias of text" },
    ],
  },
  {
    type: "branch.if",
    label: "Branch if",
    category: "flow",
    fields: [
      { key: "left", label: "Left", type: "string", required: true, placeholder: "{{path}}" },
      {
        key: "operator",
        label: "Operator",
        type: "select",
        required: true,
        options: BRANCH_OPERATORS,
      },
      { key: "right", label: "Right", type: "string" },
    ],
    outputs: [{ key: "result", label: "result", description: "boolean branch result" }],
  },
  {
    type: "workflow.subworkflow",
    label: "Subworkflow",
    category: "flow",
    fields: [
      {
        key: "workflowRef",
        label: "Workflow file",
        type: "workflow-ref",
        required: true,
      },
      {
        key: "inputMapping",
        label: "Input mapping (JSON)",
        type: "json",
        placeholder: '{"path":"{{path}}"}',
      },
      {
        key: "outputMapping",
        label: "Output mapping (JSON)",
        type: "json",
        placeholder: '{"report":"ingestReport"}',
      },
      {
        key: "failParentOnError",
        label: "Fail parent on error",
        type: "select",
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
    ],
    outputs: [
      { key: "__childRun", label: "__childRun", description: "Child RunReport" },
      { key: "*", label: "(mapped outputs)", description: "See outputMapping" },
    ],
  },
  {
    type: "vault.backup.push",
    label: "Backup push",
    category: "vault",
    fields: [
      {
        key: "scope",
        label: "Scope",
        type: "select",
        options: [
          { value: "enterpriseflow", label: "enterpriseflow" },
          { value: "full", label: "full" },
        ],
      },
    ],
    outputs: [{ key: "report", label: "report", description: "BackupReport" }],
  },
  {
    type: "vault.backup.pull",
    label: "Backup pull",
    category: "vault",
    fields: [
      { key: "snapshotId", label: "Snapshot ID", type: "string" },
      {
        key: "mode",
        label: "Mode",
        type: "select",
        options: [
          { value: "merge", label: "merge" },
          { value: "replace", label: "replace" },
        ],
      },
      {
        key: "confirmed",
        label: "Replace confirmed",
        type: "select",
        options: [
          { value: "false", label: "false" },
          { value: "true", label: "true" },
        ],
      },
    ],
    outputs: [{ key: "report", label: "report", description: "RestoreReport" }],
  },
  {
    type: "output.notice",
    label: "Output notice",
    category: "output",
    fields: [
      { key: "message", label: "Message", type: "string", required: true, placeholder: "{{summary}}" },
    ],
    outputs: [],
  },
  {
    type: "output.text",
    label: "Output text",
    category: "output",
    fields: [
      {
        key: "text",
        label: "Text",
        type: "text",
        required: true,
        placeholder: "{{summary}}",
      },
      {
        key: "path",
        label: "Write to path (optional)",
        type: "string",
        placeholder: "output/result.md",
      },
    ],
    outputs: [{ key: "text", label: "text" }],
  },
];

export function getNodeCatalogEntry(type: string): NodeCatalogEntry | undefined {
  return NODE_CATALOG.find((n) => n.type === type);
}

export function formatNodeOutputsBagTemplate(nodeId: string): string {
  return `{{${nodeId}.output}}`;
}

export function formatOutputTemplate(nodeId: string, outputKey: string): string {
  return `{{${nodeId}.${outputKey}}}`;
}

export function listUpstreamNodes(
  nodeId: string,
  edges: { source: string; target: string }[],
): string[] {
  const upstream = new Set<string>();
  let frontier = [nodeId];
  while (frontier.length) {
    const next: string[] = [];
    for (const edge of edges) {
      if (!frontier.includes(edge.target) || upstream.has(edge.source)) continue;
      upstream.add(edge.source);
      next.push(edge.source);
    }
    frontier = next;
  }
  return [...upstream];
}

export function validateNodeData(
  type: string,
  data: Record<string, unknown>,
): string[] {
  const entry = getNodeCatalogEntry(type);
  if (!entry) return [];

  const errors: string[] = [];
  for (const field of entry.fields) {
    if (!field.required) continue;
    const value = data[field.key];
    if (value === undefined || value === null || value === "") {
      errors.push(`${field.label} is required`);
    }
  }
  return errors;
}
