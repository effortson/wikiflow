import type { WorkflowDefinition } from "@shared/types/workflow";
import type { CoreServices } from "../core/core-services";
import type { PluginSettings } from "../core/config/settings";
import type { WikiService } from "../wiki/service";
import type { WorkflowService } from "@shared/types/workflow";
import type { VaultAdapter } from "../core/vault/vault-adapter";
import { EnterpriseWorkflowService } from "./workflow-service";

import { normalizeWorkflowDefinition } from "./schema/normalize-workflow";

export type { WorkflowService };

export function parseWorkflowDefinition(raw: string): WorkflowDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Workflow file is not valid JSON");
  }

  const def = parsed as WorkflowDefinition;
  if (def.schemaVersion !== 1) {
    throw new Error(
      `Unsupported workflow schemaVersion: ${String(def.schemaVersion)}`,
    );
  }
  if (!def.id || typeof def.id !== "string") {
    throw new Error("Workflow id is required");
  }
  if (!def.name || typeof def.name !== "string") {
    throw new Error("Workflow name is required");
  }
  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
    throw new Error("Workflow must have at least one node");
  }
  if (!Array.isArray(def.edges)) {
    throw new Error("Workflow edges must be an array");
  }

  for (const node of def.nodes) {
    if (!node.id || !node.type) {
      throw new Error("Each workflow node requires id and type");
    }
  }

  return normalizeWorkflowDefinition(def);
}

export class WorkflowLoader {
  constructor(private vault: VaultAdapter) {}

  async load(definitionPath: string): Promise<WorkflowDefinition> {
    const raw = await this.vault.readText(definitionPath);
    return parseWorkflowDefinition(raw);
  }
}

export function createWorkflowService(ctx: {
  core: CoreServices;
  wiki: WikiService;
  getSettings: () => PluginSettings;
  notice?: (message: string) => void;
}): EnterpriseWorkflowService {
  return new EnterpriseWorkflowService(ctx);
}

export { EnterpriseWorkflowService };
