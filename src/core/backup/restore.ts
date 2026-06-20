import { normalizePath, TFile, type Vault } from "obsidian";
import type { BackupManifest } from "@shared/types/backup";
import { toArrayBuffer } from "@shared/buffer";
import { sha256Hex } from "@shared/hash";
import {
  fileModifiedAtIso,
  hashVaultFile,
} from "./snapshot";
import { listFilesInScope, type ScopeOptions } from "./scope";

export interface RestorePlan {
  filesAdded: number;
  filesUpdated: number;
  filesDeleted: number;
  pathsToWrite: { path: string; data: Uint8Array }[];
  pathsToDelete: string[];
  changedPaths: string[];
}

/** Reject zip-slip and absolute paths from untrusted snapshots. */
export function sanitizeRestorePath(path: string): string | null {
  const normalized = normalizePath(path);
  if (!normalized || normalized.startsWith("/")) return null;
  const segments = normalized.split("/");
  if (segments.some((s) => s === ".." || s === ".")) return null;
  return normalized;
}

export async function planRestore(
  vault: Vault,
  manifest: BackupManifest,
  files: Map<string, Uint8Array>,
  mode: "merge" | "replace",
  scopeOptions: ScopeOptions,
): Promise<RestorePlan> {
  const pathsToWrite: { path: string; data: Uint8Array }[] = [];
  const changedPaths: string[] = [];
  let filesAdded = 0;
  let filesUpdated = 0;

  for (const entry of manifest.files) {
    const safePath = sanitizeRestorePath(entry.path);
    if (!safePath) {
      throw new Error(`Unsafe path in snapshot manifest: ${entry.path}`);
    }

    const data = files.get(entry.path);
    if (!data) continue;

    const fileHash = await sha256Hex(data);
    if (fileHash !== entry.contentHash) {
      throw new Error(`Snapshot file hash mismatch: ${entry.path}`);
    }

    const existing = vault.getAbstractFileByPath(safePath);
    if (!(existing instanceof TFile)) {
      pathsToWrite.push({ path: safePath, data });
      changedPaths.push(safePath);
      filesAdded++;
      continue;
    }

    const localHash = await hashVaultFile(existing, vault);
    const localModifiedAt = await fileModifiedAtIso(existing);

    // Replace mode treats the snapshot as authoritative. Merge mode only takes
    // the snapshot's copy when it is strictly newer, so it never clobbers a
    // local edit made after the snapshot was captured.
    const shouldUpdate =
      mode === "replace"
        ? localHash !== entry.contentHash
        : localHash !== entry.contentHash && entry.modifiedAt > localModifiedAt;

    if (shouldUpdate) {
      pathsToWrite.push({ path: safePath, data });
      changedPaths.push(safePath);
      filesUpdated++;
    }
  }

  const pathsToDelete: string[] = [];
  if (mode === "replace") {
    const snapshotPaths = new Set(
      manifest.files
        .map((f) => sanitizeRestorePath(f.path))
        .filter((p): p is string => p !== null),
    );
    const localScoped = listFilesInScope(vault, {
      ...scopeOptions,
      scope: manifest.scope,
      includeExtractCache: manifest.includeExtractCache,
      // Delete-candidate scope must match the snapshot's own exclusions, or
      // replace mode would delete files that were deliberately excluded from
      // the backup (and are therefore not in snapshotPaths).
      excludePatterns: manifest.excludes ?? scopeOptions.excludePatterns,
    });

    for (const file of localScoped) {
      if (!snapshotPaths.has(file.path)) {
        pathsToDelete.push(file.path);
      }
    }
  }

  return {
    filesAdded,
    filesUpdated,
    filesDeleted: pathsToDelete.length,
    pathsToWrite,
    pathsToDelete,
    changedPaths,
  };
}

export async function applyRestorePlan(
  vault: Vault,
  plan: RestorePlan,
): Promise<void> {
  for (const { path, data } of plan.pathsToWrite) {
    const normalized = sanitizeRestorePath(path);
    if (!normalized) {
      throw new Error(`Unsafe restore path: ${path}`);
    }

    const parts = normalized.split("/");
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join("/");
      const folderExists = vault.getAbstractFileByPath(folder);
      if (!folderExists) {
        await vault.createFolder(folder);
      }
    }

    const buffer = toArrayBuffer(data);
    const existing = vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await vault.modifyBinary(existing, buffer);
    } else {
      await vault.createBinary(normalized, buffer);
    }
  }

  for (const path of plan.pathsToDelete) {
    const file = vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await vault.delete(file);
    }
  }
}

export function inferWikiIdsFromPaths(
  paths: string[],
  wikiRoot: string,
): string[] {
  const prefix = `${normalizePath(wikiRoot)}/`;
  const ids = new Set<string>();
  for (const path of paths) {
    const normalized = normalizePath(path);
    if (!normalized.startsWith(prefix)) continue;
    const rest = normalized.slice(prefix.length);
    const wikiId = rest.split("/")[0];
    if (wikiId) ids.add(wikiId);
  }
  return [...ids].sort();
}
