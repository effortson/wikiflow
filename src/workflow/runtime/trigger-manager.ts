import type { PluginSettings } from "../../core/config/settings";
import type { CoreServices } from "../../core/core-services";
import type { WorkflowDefinition } from "@shared/types/workflow";
import type { EnterpriseWorkflowService } from "../workflow-service";

export interface TriggerManagerDeps {
  core: CoreServices;
  getSettings: () => PluginSettings;
  workflow: EnterpriseWorkflowService;
  loadWorkflowAtPath: (path: string) => Promise<WorkflowDefinition>;
}

export class TriggerManager {
  private unsubscribers: (() => void)[] = [];
  private triggeredPaths = new Map<string, Set<string>>();

  constructor(private deps: TriggerManagerDeps) {}

  start(): void {
    const off = this.deps.core.events.subscribe("file:added", (payload) => {
      if (!payload.wikiId) return;
      void this.onFileAdded(payload.path, payload.wikiId);
    });
    this.unsubscribers.push(off);
  }

  stop(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.triggeredPaths.clear();
  }

  private async onFileAdded(path: string, wikiId: string): Promise<void> {
    const workflows = await this.deps.workflow.listWorkflows();

    for (const { def } of workflows) {
      const triggers = def.nodes.filter((n) => n.type === "trigger.file-added");
      if (triggers.length === 0) continue;

      const matches = triggers.some((trigger) => {
        const nodeWikiId = trigger.data.wikiId as string | undefined;
        return !nodeWikiId || nodeWikiId === wikiId;
      });
      if (!matches) continue;

      const seen = this.triggeredPaths.get(def.id) ?? new Set<string>();
      if (!this.triggeredPaths.has(def.id)) {
        this.triggeredPaths.set(def.id, seen);
      }
      if (seen.has(path)) continue;
      seen.add(path);

      this.deps.core.logger.debug("trigger.file-added workflow run", {
        workflowId: def.id,
        path,
        wikiId,
      });

      try {
        await this.deps.workflow.run(
          def,
          { path, wikiId, file: { path } },
          {},
        );
      } catch (err) {
        this.deps.core.logger.error("workflow trigger failed", {
          workflowId: def.id,
          path,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        seen.delete(path);
        if (seen.size === 0) this.triggeredPaths.delete(def.id);
      }
    }
  }
}
