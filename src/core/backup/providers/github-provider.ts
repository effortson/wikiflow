import { requestUrl } from "obsidian";
import type { GitHubBackupSettings } from "@shared/types/backup";
import type { BackupManifest, BackupSnapshotInfo } from "@shared/types/backup";
import { parseSnapshotZip } from "../snapshot";
import type { BackupRemoteProvider, LatestPointer } from "./types";
import {
  GITHUB_CONTENTS_API_MAX_BYTES,
  GITHUB_MAX_ZIP_BYTES,
} from "./types";

interface GitHubContentResponse {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  size: number;
  download_url?: string;
  content?: string;
  encoding?: string;
}

export class GitHubBackupProvider implements BackupRemoteProvider {
  constructor(private settings: GitHubBackupSettings) {}

  async testConnection(): Promise<void> {
    const url = `https://api.github.com/repos/${this.settings.owner}/${this.settings.repo}`;
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.settings.token}`,
        Accept: "application/vnd.github+json",
      },
      throw: false,
    });
    if (response.status >= 400) {
      throw new Error(`GitHub connection failed (${response.status})`);
    }
  }

  async listSnapshots(): Promise<BackupSnapshotInfo[]> {
    const prefix = `${this.pathPrefix()}/snapshots`;
    const entries = await this.listDirectory(prefix);
    const snapshotIds = entries
      .filter((e) => e.type === "dir")
      .map((e) => e.name);

    const snapshots: BackupSnapshotInfo[] = [];
    for (const snapshotId of snapshotIds) {
      try {
        const manifest = await this.downloadManifest(snapshotId);
        snapshots.push({
          snapshotId: manifest.snapshotId,
          createdAt: manifest.createdAt,
          contentHash: manifest.contentHash,
          totalBytes: manifest.totalBytes,
          scope: manifest.scope,
        });
      } catch {
        // skip
      }
    }

    return snapshots.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async uploadSnapshot(
    snapshotId: string,
    manifest: BackupManifest,
    zipBytes: Uint8Array,
  ): Promise<void> {
    if (zipBytes.byteLength > GITHUB_MAX_ZIP_BYTES) {
      throw new Error(
        `Snapshot zip exceeds GitHub limit (${GITHUB_MAX_ZIP_BYTES} bytes). Use S3 instead.`,
      );
    }

    await this.putFile(
      this.filePath(snapshotId, "manifest.json"),
      new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      `backup manifest ${snapshotId}`,
    );
    await this.putFile(
      this.filePath(snapshotId, "snapshot.zip"),
      zipBytes,
      `backup snapshot ${snapshotId}`,
    );
  }

  async downloadSnapshot(snapshotId: string): Promise<{
    manifest: BackupManifest;
    zipBytes: Uint8Array;
  }> {
    const zipBytes = await this.getFile(this.filePath(snapshotId, "snapshot.zip"));
    const parsed = parseSnapshotZip(zipBytes);
    return { manifest: parsed.manifest, zipBytes };
  }

  async downloadLatestPointer(): Promise<LatestPointer | null> {
    try {
      const bytes = await this.getFile(this.latestPath());
      return JSON.parse(new TextDecoder().decode(bytes)) as LatestPointer;
    } catch {
      return null;
    }
  }

  async writeLatestPointer(pointer: LatestPointer): Promise<void> {
    await this.putFile(
      this.latestPath(),
      new TextEncoder().encode(JSON.stringify(pointer, null, 2)),
      "update latest backup pointer",
    );
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    await this.deleteFile(this.filePath(snapshotId, "manifest.json"));
    await this.deleteFile(this.filePath(snapshotId, "snapshot.zip"));
  }

  private async downloadManifest(snapshotId: string): Promise<BackupManifest> {
    const bytes = await this.getFile(this.filePath(snapshotId, "manifest.json"));
    return JSON.parse(new TextDecoder().decode(bytes)) as BackupManifest;
  }

  private pathPrefix(): string {
    return this.settings.pathPrefix.replace(/^\//, "").replace(/\/$/, "");
  }

  private filePath(snapshotId: string, name: string): string {
    return `${this.pathPrefix()}/snapshots/${snapshotId}/${name}`;
  }

  private latestPath(): string {
    return `${this.pathPrefix()}/latest.json`;
  }

  private async api(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map((s) => encodeURIComponent(s))
      .join("/");

    const url = `https://api.github.com/repos/${this.settings.owner}/${this.settings.repo}/contents/${encodedPath}?ref=${encodeURIComponent(this.settings.branch)}`;

    const response = await requestUrl({
      url,
      method,
      headers: {
        Authorization: `Bearer ${this.settings.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`GitHub API ${method} failed (${response.status}): ${response.text}`);
    }

    if (response.status === 204) return null;
    return response.json;
  }

  private async listDirectory(path: string): Promise<GitHubContentResponse[]> {
    const result = await this.api("GET", path);
    if (!Array.isArray(result)) return [];
    return result as GitHubContentResponse[];
  }

  private async getFile(path: string): Promise<Uint8Array> {
    const meta = (await this.api("GET", path)) as GitHubContentResponse;
    if (meta.download_url) {
      const response = await requestUrl({
        url: meta.download_url,
        method: "GET",
        throw: false,
      });
      if (response.status >= 400) {
        throw new Error(`GitHub download failed (${response.status})`);
      }
      return new Uint8Array(response.arrayBuffer);
    }

    if (meta.content && meta.encoding === "base64") {
      return base64ToBytes(meta.content.replace(/\n/g, ""));
    }

    throw new Error(`GitHub file has no content: ${path}`);
  }

  private async putFile(
    path: string,
    bytes: Uint8Array,
    message: string,
  ): Promise<void> {
    if (bytes.byteLength > GITHUB_CONTENTS_API_MAX_BYTES) {
      await this.putFileViaGitData(path, bytes, message);
      return;
    }

    let sha: string | undefined;
    try {
      const existing = (await this.api("GET", path)) as GitHubContentResponse;
      sha = existing.sha;
    } catch {
      sha = undefined;
    }

    await this.api("PUT", path, {
      message,
      content: bytesToBase64(bytes),
      branch: this.settings.branch,
      ...(sha ? { sha } : {}),
    });
  }

  private async putFileViaGitData(
    path: string,
    bytes: Uint8Array,
    message: string,
  ): Promise<void> {
    if (bytes.byteLength > GITHUB_MAX_ZIP_BYTES) {
      throw new Error(
        `Snapshot zip exceeds GitHub limit (${GITHUB_MAX_ZIP_BYTES} bytes). Use S3 instead.`,
      );
    }

    const blob = (await this.gitApi("POST", "/git/blobs", {
      content: bytesToBase64(bytes),
      encoding: "base64",
    })) as { sha: string };

    const ref = (await this.gitApi(
      "GET",
      `/git/ref/heads/${encodeURIComponent(this.settings.branch)}`,
    )) as { object: { sha: string } };
    const commitSha = ref.object.sha;

    const commit = (await this.gitApi(
      "GET",
      `/git/commits/${commitSha}`,
    )) as { tree: { sha: string } };

    const tree = (await this.gitApi("POST", "/git/trees", {
      base_tree: commit.tree.sha,
      tree: [
        {
          path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        },
      ],
    })) as { sha: string };

    const newCommit = (await this.gitApi("POST", "/git/commits", {
      message,
      tree: tree.sha,
      parents: [commitSha],
    })) as { sha: string };

    await this.gitApi(
      "PATCH",
      `/git/refs/heads/${encodeURIComponent(this.settings.branch)}`,
      { sha: newCommit.sha },
    );
  }

  private async gitApi(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `https://api.github.com/repos/${this.settings.owner}/${this.settings.repo}${endpoint}`;
    const response = await requestUrl({
      url,
      method,
      headers: {
        Authorization: `Bearer ${this.settings.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(
        `GitHub Git API ${method} failed (${response.status}): ${response.text}`,
      );
    }

    if (response.status === 204) return null;
    return response.json;
  }

  private async deleteFile(path: string): Promise<void> {
    const existing = (await this.api("GET", path)) as GitHubContentResponse;
    await this.api("DELETE", path, {
      message: `delete ${path}`,
      sha: existing.sha,
      branch: this.settings.branch,
    });
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
