import { strToU8, zipSync, unzipSync } from "fflate";
import type { TFile, Vault } from "obsidian";
import type {
  BackupManifest,
  BackupManifestEntry,
} from "@shared/types/backup";
import { sha256Hex, sha256Text } from "@shared/hash";
import { listFilesInScope, type ScopeOptions } from "./scope";

export interface SnapshotBuildResult {
  snapshotId: string;
  manifest: BackupManifest;
  zipBytes: Uint8Array;
}

export function createSnapshotId(date = new Date()): string {
  // Millisecond precision so two snapshots in the same second don't collide
  // and silently overwrite each other.
  return date.toISOString().replace(/[-:.]/g, "");
}

export async function buildSnapshot(
  vault: Vault,
  options: ScopeOptions & {
    vaultName: string;
    pluginVersion: string;
    signal?: AbortSignal;
  },
): Promise<SnapshotBuildResult> {
  const snapshotId = createSnapshotId();
  const files = listFilesInScope(vault, options);
  const entries: BackupManifestEntry[] = [];
  const zipEntries: Record<string, Uint8Array> = {};

  for (const file of files) {
    if (options.signal?.aborted) throw new Error("Snapshot build cancelled");

    const bytes = await vault.readBinary(file);
    const contentHash = await sha256Hex(bytes);
    const modifiedAt = new Date(file.stat.mtime).toISOString();

    entries.push({
      path: file.path,
      size: bytes.byteLength,
      modifiedAt,
      contentHash,
    });
    zipEntries[file.path] = new Uint8Array(bytes);
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const manifest: BackupManifest = {
    schemaVersion: 1,
    snapshotId,
    vaultName: options.vaultName,
    createdAt: new Date().toISOString(),
    pluginVersion: options.pluginVersion,
    scope: options.scope,
    includeExtractCache: options.includeExtractCache,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, e) => sum + e.size, 0),
    contentHash: "",
    excludes: options.excludePatterns,
    files: entries,
  };

  // contentHash is a deterministic digest of the manifest, which transitively
  // covers every file via its per-file contentHash. Hashing the zip bytes is
  // NOT reproducible: fflate stamps each entry's mtime with the build time, so
  // verifySnapshotIntegrity could never rebuild the same bytes on a later
  // restore (the check would always fail).
  manifest.contentHash = await hashManifestContent(manifest);
  zipEntries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  const zipBytes = zipSync(zipEntries, { level: 6 });

  return {
    snapshotId,
    manifest,
    zipBytes,
  };
}

export function parseSnapshotZip(zipBytes: Uint8Array): {
  manifest: BackupManifest;
  files: Map<string, Uint8Array>;
} {
  const unzipped = unzipSync(zipBytes);
  const manifestRaw = unzipped["manifest.json"];
  if (!manifestRaw) {
    throw new Error("Snapshot zip missing manifest.json");
  }

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(
      new TextDecoder().decode(manifestRaw),
    ) as BackupManifest;
  } catch {
    throw new Error("Snapshot manifest.json is not valid JSON");
  }

  if (manifest.schemaVersion !== 1) {
    throw new Error(
      `Unsupported snapshot schemaVersion: ${String(manifest.schemaVersion)}`,
    );
  }
  if (!manifest.snapshotId || !Array.isArray(manifest.files)) {
    throw new Error("Snapshot manifest.json is missing required fields");
  }

  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(unzipped)) {
    if (path === "manifest.json") continue;
    files.set(path, data);
  }

  return { manifest, files };
}

export async function verifySnapshotIntegrity(
  zipBytes: Uint8Array,
): Promise<{ manifest: BackupManifest; files: Map<string, Uint8Array> }> {
  const parsed = parseSnapshotZip(zipBytes);

  if (parsed.manifest.contentHash) {
    const expected = await hashManifestContent(parsed.manifest);
    if (parsed.manifest.contentHash !== expected) {
      throw new Error("Snapshot manifest contentHash mismatch");
    }
  }

  for (const entry of parsed.manifest.files) {
    const data = parsed.files.get(entry.path);
    if (!data) {
      throw new Error(`Snapshot missing file: ${entry.path}`);
    }
    const hash = await sha256Hex(data);
    if (hash !== entry.contentHash) {
      throw new Error(`Snapshot file contentHash mismatch: ${entry.path}`);
    }
  }

  return parsed;
}

export async function hashVaultFile(file: TFile, vault: Vault): Promise<string> {
  const bytes = await vault.readBinary(file);
  return sha256Hex(bytes);
}

export async function fileModifiedAtIso(file: TFile): Promise<string> {
  return new Date(file.stat.mtime).toISOString();
}

export async function hashBytes(data: Uint8Array): Promise<string> {
  return sha256Hex(data);
}

export async function hashManifestContent(
  manifest: BackupManifest,
): Promise<string> {
  return sha256Text(JSON.stringify({ ...manifest, contentHash: "" }));
}
