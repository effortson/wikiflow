import type { WorkflowDefinition } from "@shared/types/workflow";

const WIKI_NODE_TYPES = new Set([
  "wiki.ingest",
  "wiki.query",
  "wiki.query-batch",
]);

export interface ResolveRunInputsOptions {
  def: WorkflowDefinition;
  runPrompt: string;
  activeWikiId?: string;
  wikiIds: string[];
}

export interface ResolveRunInputsResult {
  inputs: Record<string, unknown>;
  error?: string;
}

function userInputPromptLabel(
  trigger: WorkflowDefinition["nodes"][number] | undefined,
): string {
  const prompt = trigger?.data.prompt;
  return typeof prompt === "string" && prompt.trim()
    ? prompt.trim()
    : "问题";
}

export function getUserInputPromptLabel(
  def: WorkflowDefinition,
): string | undefined {
  const trigger = def.nodes.find((node) => node.type === "trigger.user-input");
  if (!trigger) return undefined;
  return userInputPromptLabel(trigger);
}

function nodeNeedsWikiIdTemplate(def: WorkflowDefinition): boolean {
  return def.nodes.some((node) => {
    if (!WIKI_NODE_TYPES.has(node.type)) return false;
    const wikiId = node.data.wikiId;
    return typeof wikiId === "string" && wikiId.includes("{{wikiId}}");
  });
}

function resolveWikiIdForRun(
  def: WorkflowDefinition,
  activeWikiId: string | undefined,
  wikiIds: string[],
): string | undefined {
  if (!nodeNeedsWikiIdTemplate(def)) return undefined;

  if (activeWikiId) return activeWikiId;
  if (wikiIds.length === 1) return wikiIds[0];
  if (wikiIds.length > 1) return wikiIds[0];
  return undefined;
}

export function resolveWorkflowRunInputs(
  options: ResolveRunInputsOptions,
): ResolveRunInputsResult {
  const inputs: Record<string, unknown> = {};
  const inputTrigger = options.def.nodes.find(
    (node) => node.type === "trigger.user-input",
  );

  if (inputTrigger) {
    const text = options.runPrompt.trim();
    if (!text) {
      return {
        inputs,
        error: `请先输入${userInputPromptLabel(inputTrigger)}`,
      };
    }
    inputs.text = text;
  }

  const wikiId = resolveWikiIdForRun(
    options.def,
    options.activeWikiId,
    options.wikiIds,
  );
  if (nodeNeedsWikiIdTemplate(options.def) && !wikiId) {
    return {
      inputs,
      error: "请在 Wiki batch 节点填写 wikiId，或在设置中指定当前 Wiki",
    };
  }
  if (wikiId) {
    inputs.wikiId = wikiId;
  }

  return { inputs };
}
