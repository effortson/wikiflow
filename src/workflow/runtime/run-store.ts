import type { RunReport } from "@shared/types/workflow";
import type { VaultAdapter } from "../../core/vault/vault-adapter";

const RUNS_ROOT = ".wikiflow/runs";

export class RunStore {
  constructor(private vault: VaultAdapter) {}

  rootPath(rootRunId: string): string {
    return `${RUNS_ROOT}/${rootRunId}`;
  }

  reportPath(rootRunId: string, runId: string): string {
    return `${this.rootPath(rootRunId)}/${runId}.json`;
  }

  async saveReport(report: RunReport): Promise<void> {
    const dir = this.rootPath(report.rootRunId);
    await this.vault.mkdir(dir);
    const path = this.reportPath(report.rootRunId, report.runId);
    await this.vault.writeText(path, JSON.stringify(report, null, 2));
    await this.writeTree(report.rootRunId);
  }

  async writeTree(rootRunId: string): Promise<void> {
    const dir = this.rootPath(rootRunId);
    const children = this.vault.listFolder(dir);
    const reports: RunReport[] = [];

    for (const child of children) {
      if (!child.endsWith(".json") || child.endsWith("tree.json")) continue;
      try {
        const text = await this.vault.readText(child);
        reports.push(JSON.parse(text) as RunReport);
      } catch {
        // skip corrupt files
      }
    }

    const root = reports.find((r) => r.runId === rootRunId) ?? reports[0];
    if (!root) return;

    const tree = buildRunTree(reports, rootRunId);
    await this.vault.writeText(
      `${dir}/tree.json`,
      JSON.stringify(tree, null, 2),
    );
  }

  listRootRunIds(): string[] {
    if (!this.vault.listFolder(RUNS_ROOT).length) {
      return [];
    }
    return this.vault
      .listFolder(RUNS_ROOT)
      .map((p) => p.split("/").pop()!)
      .filter(Boolean);
  }

  async readRootReport(rootRunId: string): Promise<RunReport | null> {
    const path = this.reportPath(rootRunId, rootRunId);
    if (!(await this.vault.exists(path))) return null;
    const text = await this.vault.readText(path);
    return JSON.parse(text) as RunReport;
  }

  async deleteRootRun(rootRunId: string): Promise<void> {
    const dir = this.rootPath(rootRunId);
    for (const file of this.vault.listFolder(dir)) {
      await this.vault.getVault().adapter.remove(file);
    }
    const dirPath = this.rootPath(rootRunId);
    if (await this.vault.exists(dirPath)) {
      await this.vault.getVault().adapter.rmdir(dirPath, true);
    }
  }
}

function buildRunTree(reports: RunReport[], rootRunId: string): RunReport {
  const byId = new Map(reports.map((r) => [r.runId, { ...r, childRuns: [] as RunReport[] }]));

  for (const report of byId.values()) {
    if (report.parentRunId) {
      const parent = byId.get(report.parentRunId);
      parent?.childRuns?.push(report);
    }
  }

  return byId.get(rootRunId) ?? reports[0];
}
