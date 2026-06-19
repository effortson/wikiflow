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

  const reports: { id: string; startedAt: string }[] = [];
  for (const id of rootIds) {
    const report = await loadReport(id);
    if (report?.startedAt) {
      reports.push({ id, startedAt: report.startedAt });
    }
  }

  reports.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const recentKeep = new Set(
    reports.slice(0, settings.workflowRunRetentionCount).map((r) => r.id),
  );

  const cutoff = Date.now() - settings.workflowRunRetentionDays * 86_400_000;
  const deleted: string[] = [];

  for (const { id, startedAt } of reports) {
    const withinDays = new Date(startedAt).getTime() >= cutoff;
    const inRecent = recentKeep.has(id);
    if (withinDays || inRecent) continue;

    await store.deleteRootRun(id);
    deleted.push(id);
  }

  return deleted;
}
