import type {
  BackupManifest,
  BackupSnapshotInfo,
} from "@shared/types/backup";

export interface LatestPointer {
  snapshotId: string;
  createdAt: string;
  contentHash: string;
}

export interface BackupRemoteProvider {
  testConnection(): Promise<void>;
  listSnapshots(): Promise<BackupSnapshotInfo[]>;
  uploadSnapshot(
    snapshotId: string,
    manifest: BackupManifest,
    zipBytes: Uint8Array,
  ): Promise<void>;
  downloadSnapshot(snapshotId: string): Promise<{
    manifest: BackupManifest;
    zipBytes: Uint8Array;
  }>;
  downloadLatestPointer(): Promise<LatestPointer | null>;
  deleteSnapshot(snapshotId: string): Promise<void>;
  writeLatestPointer(pointer: LatestPointer): Promise<void>;
}

/** GitHub Contents API inline upload limit (~1 MB). Larger files use Git Data API. */
export const GITHUB_CONTENTS_API_MAX_BYTES = 1_000_000;
/** GitHub Git blob size limit for snapshot zips. */
export const GITHUB_MAX_ZIP_BYTES = 100 * 1024 * 1024;
