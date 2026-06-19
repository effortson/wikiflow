import type { IngestOptions } from "./wiki";
import type { WikiId } from "./wiki-instance";

export interface IngestReport {
  wikiId: WikiId;
  sourceId?: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  createdPages: string[];
  updatedPages: string[];
  skippedPages: string[];
  errors: IngestError[];
  durationMs: number;
  startedAt: string;
  finishedAt?: string;
}

export interface IngestError {
  sourceId?: string;
  pagePath?: string;
  code:
    | "extract_failed"
    | "llm_failed"
    | "write_failed"
    | "wiki_mismatch"
    | "cancelled";
  message: string;
}

export interface IngestWikiOptions extends IngestOptions {
  glob?: string;
  skipUnchanged?: boolean;
  concurrency?: number;
}
