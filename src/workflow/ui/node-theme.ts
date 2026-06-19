import type { NodeCatalogEntry } from "./node-schemas";
import { getNodeCatalogEntry } from "./node-schemas";

export type NodeCategory = NodeCatalogEntry["category"];

export interface NodeCategoryTheme {
  accent: string;
  soft: string;
  label: string;
}

export const NODE_CATEGORY_THEME: Record<NodeCategory, NodeCategoryTheme> = {
  trigger: { accent: "#e08a09", soft: "#fdf0dd", label: "TRIGGER" },
  wiki: { accent: "#2f7df4", soft: "#e7f0fe", label: "WIKI" },
  flow: { accent: "#7c5cf5", soft: "#efeafe", label: "FLOW" },
  llm: { accent: "#e0479b", soft: "#fce4ef", label: "LLM" },
  vault: { accent: "#0fa97b", soft: "#d9f3ea", label: "VAULT" },
  output: { accent: "#0fa97b", soft: "#d9f3ea", label: "OUTPUT" },
};

const CATEGORY_CLASS: Record<NodeCategory, string> = {
  trigger: "ef-node-cat--trigger",
  wiki: "ef-node-cat--wiki",
  flow: "ef-node-cat--flow",
  llm: "ef-node-cat--llm",
  vault: "ef-node-cat--vault",
  output: "ef-node-cat--output",
};

const NODE_SUBTITLES: Record<string, string> = {
  "trigger.manual": "Starts on demand",
  "trigger.file-added": "Runs when a file is added",
  "trigger.user-input": "Run-time prompt via modal",
  "file.pick": "Select a vault file",
  "doc.extract": "Parse document content",
  "wiki.ingest": "Write pages to wiki",
  "wiki.query": "Search the knowledge base",
  "wiki.query-batch": "Query wiki for multiple questions",
  "llm.chat": "Generate with LLM",
  "branch.if": "Conditional routing",
  "workflow.subworkflow": "Run nested workflow",
  "vault.backup.push": "Push backup snapshot",
  "vault.backup.pull": "Restore from snapshot",
  "output.notice": "Send a notification",
  "output.text": "Write or emit text",
};

export function getNodeCategory(nodeType: string): NodeCategory {
  return getNodeCatalogEntry(nodeType)?.category ?? "flow";
}

export function getNodeCategoryClass(nodeType: string): string {
  return CATEGORY_CLASS[getNodeCategory(nodeType)];
}

export function getNodeTheme(nodeType: string): NodeCategoryTheme {
  return NODE_CATEGORY_THEME[getNodeCategory(nodeType)];
}

export function getNodeSubtitle(nodeType: string): string {
  return NODE_SUBTITLES[nodeType] ?? nodeType;
}

export function getNodeInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export type NodeStatusKind = "ready" | "running" | "done" | "failed" | "error";

export function getNodeStatusKind(
  runPhase: "idle" | "running" | "completed" | "failed" | undefined,
  hasError?: boolean,
): NodeStatusKind {
  if (hasError) return "error";
  if (runPhase === "running") return "running";
  if (runPhase === "completed") return "done";
  if (runPhase === "failed") return "failed";
  return "ready";
}

export const NODE_STATUS_LABEL: Record<NodeStatusKind, string> = {
  ready: "Ready",
  running: "Running",
  done: "Done",
  failed: "Failed",
  error: "Error",
};
