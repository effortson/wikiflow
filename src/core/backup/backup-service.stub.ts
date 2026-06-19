import type {
  BackupPushOptions,
  BackupReport,
  BackupService,
  BackupSnapshotInfo,
  RestoreOptions,
  RestoreReport,
} from "@shared/types/backup";

export class StubBackupService implements BackupService {
  async testConnection(): Promise<void> {
    throw notImplemented("BackupService.testConnection");
  }

  async listSnapshots(): Promise<BackupSnapshotInfo[]> {
    throw notImplemented("BackupService.listSnapshots");
  }

  async push(_options?: BackupPushOptions): Promise<BackupReport> {
    throw notImplemented("BackupService.push");
  }

  async pull(_options: RestoreOptions): Promise<RestoreReport> {
    throw notImplemented("BackupService.pull");
  }
}

function notImplemented(method: string): Error {
  return new Error(`${method} is not implemented (Phase 6)`);
}
