export type BackupProvider = "none" | "s3" | "github";
export type BackupScope = "full" | "enterpriseflow";

export interface BackupManifestEntry {
  path: string;
  size: number;
  modifiedAt: string;
  contentHash: string;
}

export interface BackupManifest {
  schemaVersion: 1;
  snapshotId: string;
  vaultName: string;
  createdAt: string;
  pluginVersion: string;
  scope: BackupScope;
  includeExtractCache: boolean;
  fileCount: number;
  totalBytes: number;
  contentHash: string;
  excludes: string[];
  files: BackupManifestEntry[];
}

export interface BackupSettingsCommon {
  scope: BackupScope;
  includeExtractCache: boolean;
  excludePatterns: string[];
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  retentionCount: number;
}

export interface S3BackupSettings extends BackupSettingsCommon {
  provider: "s3";
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export interface GitHubBackupSettings extends BackupSettingsCommon {
  provider: "github";
  owner: string;
  repo: string;
  branch: string;
  pathPrefix: string;
  token: string;
}

export type BackupSettings =
  | { provider: "none" }
  | S3BackupSettings
  | GitHubBackupSettings;

export interface BackupSnapshotInfo {
  snapshotId: string;
  createdAt: string;
  contentHash: string;
  totalBytes: number;
  scope: BackupScope;
}

export interface BackupPushOptions {
  scope?: BackupScope;
  signal?: AbortSignal;
}

export interface RestoreOptions {
  snapshotId?: string;
  mode: "merge" | "replace";
  dryRun?: boolean;
  signal?: AbortSignal;
}

export interface BackupReport {
  snapshotId: string;
  provider: BackupProvider;
  status: "completed" | "failed" | "cancelled";
  uploadedBytes: number;
  durationMs: number;
  error?: string;
}

export interface RestoreReport {
  snapshotId: string;
  provider: BackupProvider;
  status: "completed" | "failed" | "cancelled";
  mode: "merge" | "replace";
  filesAdded: number;
  filesUpdated: number;
  filesDeleted: number;
  dryRun: boolean;
  changedPaths?: string[];
  error?: string;
}

export interface BackupService {
  testConnection(): Promise<void>;
  listSnapshots(): Promise<BackupSnapshotInfo[]>;
  push(options?: BackupPushOptions): Promise<BackupReport>;
  pull(options: RestoreOptions): Promise<RestoreReport>;
}
