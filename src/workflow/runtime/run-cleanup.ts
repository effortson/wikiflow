import type { RunReport } from "@shared/types/workflow";
import type { RunStore } from "./run-store";

export interface RunRetentionSettings {
  workflowRunRetentionDays: number;
  workflowRunRetentionCount: number;
}

/** R11 OR semantics: keep if within days OR among recent N root runs. */
export async function cleanupWorkflowRuns(
  store: RunStore,
  settings: RunRetentionSettings,
  loadReport: (rootRunId: string) => Promise<RunReport | null>,
): Promise<string[]> {
  const rootIds = store.listRootRunIds();
  if (rootIds.length === 0) return [];

  // Include every run dir — even those whose report can't be loaded (corrupt or
  // not yet written) — so a broken report never leaks the directory forever.
  // Fall back to the timestamp embedded in the runId (`run-<ms>-<n>`).
  const reports: { id: string; ts: number }[] = [];
  for (const id of rootIds) {
    const report = await loadReport(id);
    const ts = report?.startedAt
      ? new Date(report.startedAt).getTime()
      : runIdTimestamp(id);
    reports.push({ id, ts: Number.isFinite(ts) ? ts : 0 });
  }

  reports.sort((a, b) => b.ts - a.ts);

  const recentKeep = new Set(
    reports.slice(0, settings.workflowRunRetentionCount).map((r) => r.id),
  );

  const cutoff = Date.now() - settings.workflowRunRetentionDays * 86_400_000;
  const deleted: string[] = [];

  for (const { id, ts } of reports) {
    const withinDays = ts >= cutoff;
    const inRecent = recentKeep.has(id);
    if (withinDays || inRecent) continue;

    await store.deleteRootRun(id);
    deleted.push(id);
  }

  return deleted;
}

/** Extract the millisecond timestamp from a `run-<ms>-<n>` id, or NaN. */
function runIdTimestamp(runId: string): number {
  const ms = Number(runId.split("-")[1]);
  return Number.isFinite(ms) ? ms : Number.NaN;
}
