import type { WikiId } from "./wiki-instance";

export type IngestProgressPhase =
  | "starting"
  | "wiki_preparing"
  | "converting"
  | "extracting"
  | "extract_cached"
  | "analyzing"
  | "writing"
  | "indexing"
  | "skipping"
  | "complete"
  | "failed";

export interface IngestProgressEvent {
  wikiId: WikiId;
  sourceId?: string;
  fileName?: string;
  phase: IngestProgressPhase;
  fileIndex?: number;
  fileTotal?: number;
  message?: string;
}
