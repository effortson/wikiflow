import type { IngestReport } from "@shared/types/ingest-report";
import type { LintReport } from "@shared/types/wiki";
import type { WikiId } from "@shared/types/wiki-instance";
import type {
  BackupReport,
  RestoreReport,
} from "@shared/types/backup";
import type { RunReport } from "@shared/types/workflow";
import type { WorkflowStepEvent } from "@shared/types/workflow-step";
import type { ContentHash, SourceId } from "@shared/types/normalized-document";
import type { IngestProgressEvent } from "@shared/types/ingest-progress";

export interface EnterpriseFlowEvents {
  "file:added": { path: string; wikiId: WikiId | null };
  "extract:done": {
    wikiId: WikiId;
    sourceId: SourceId;
    contentHash: ContentHash;
  };
  "ingest:progress": IngestProgressEvent;
  "ingest:done": { wikiId: WikiId; report: IngestReport };
  "lint:done": { wikiId: WikiId; report: LintReport };
  "workflow:done": RunReport;
  "workflow:started": { runId: string; workflowId: string; rootRunId: string };
  "workflow:step": WorkflowStepEvent;
  "workflow:child-done": {
    rootRunId: string;
    parentRunId: string;
    report: RunReport;
  };
  "backup:done": { report: BackupReport };
  "backup:failed": { report: BackupReport };
  "restore:done": { report: RestoreReport };
  "restore:failed": { report: RestoreReport };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Handler<unknown>>>();

  publish<K extends keyof EnterpriseFlowEvents>(
    event: K,
    payload: EnterpriseFlowEvents[K],
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EnterpriseFlow] Event handler failed for ${event}`, err);
      }
    }
  }

  subscribe<K extends keyof EnterpriseFlowEvents>(
    event: K,
    handler: Handler<EnterpriseFlowEvents[K]>,
  ): () => void {
    const key = event as string;
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  off<K extends keyof EnterpriseFlowEvents>(
    event: K,
    handler: Handler<EnterpriseFlowEvents[K]>,
  ): void {
    this.listeners.get(event as string)?.delete(handler as Handler<unknown>);
  }
}
