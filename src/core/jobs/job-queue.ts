import type { WikiId } from "@shared/types/wiki-instance";
import type { ContentHash } from "@shared/types/normalized-document";

export type JobKind =
  | "extract"
  | "ingest"
  | "lint"
  | "query"
  | "workflow-run"
  | "backup-push"
  | "backup-pull";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobProgress {
  message: string;
  current?: number;
  total?: number;
}

export interface Job {
  id: string;
  kind: JobKind;
  wikiId?: WikiId;
  rootRunId?: string;
  parentJobId?: string;
  status: JobStatus;
  progress?: JobProgress;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface JobHandle<T> {
  job: Job;
  result: Promise<T>;
  cancel(): void;
}

type JobExecutor<T> = (signal: AbortSignal) => Promise<T>;

let jobCounter = 0;

export class JobQueue {
  private active = new Map<string, { controller: AbortController; job: Job }>();

  enqueue<T>(
    kind: JobKind,
    executor: JobExecutor<T>,
    meta: Partial<Job> = {},
  ): JobHandle<T> {
    const id = `job-${++jobCounter}`;
    const controller = new AbortController();
    const job: Job = {
      id,
      kind,
      status: "running",
      startedAt: new Date().toISOString(),
      ...meta,
    };
    this.active.set(id, { controller, job });

    const result = (async () => {
      try {
        const value = await executor(controller.signal);
        job.status = controller.signal.aborted ? "cancelled" : "completed";
        job.finishedAt = new Date().toISOString();
        return value;
      } catch (err) {
        if (controller.signal.aborted) {
          job.status = "cancelled";
        } else {
          job.status = "failed";
          job.error = err instanceof Error ? err.message : String(err);
        }
        job.finishedAt = new Date().toISOString();
        throw err;
      } finally {
        this.active.delete(id);
      }
    })();

    return {
      job,
      result,
      cancel: () => controller.abort(),
    };
  }

  cancel(jobId: string): void {
    this.active.get(jobId)?.controller.abort();
  }

  listActive(): Job[] {
    return [...this.active.values()].map((e) => e.job);
  }
}

export class DedupRegistry {
  private ingestKeys = new Map<string, Promise<unknown>>();
  private extractKeys = new Map<string, Promise<unknown>>;

  runIngest<T>(
    wikiId: WikiId,
    sourceId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = `${wikiId}::${sourceId}`;
    return this.dedupe(this.ingestKeys, key, fn);
  }

  runExtract<T>(contentHash: ContentHash, fn: () => Promise<T>): Promise<T> {
    return this.dedupe(this.extractKeys, contentHash, fn);
  }

  private dedupe<T>(
    map: Map<string, Promise<unknown>>,
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const existing = map.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fn().finally(() => {
      if (map.get(key) === promise) map.delete(key);
    });
    map.set(key, promise);
    return promise;
  }
}
