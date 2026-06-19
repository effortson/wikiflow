import type { CoreServices } from "../core/core-services";
import type { IngestProgressEvent } from "@shared/types/ingest-progress";

export function publishIngestProgress(
  core: CoreServices,
  event: IngestProgressEvent,
): void {
  core.events.publish("ingest:progress", event);
}

export function basenameFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
