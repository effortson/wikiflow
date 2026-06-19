import { requestUrl } from "obsidian";
import { toArrayBuffer } from "@shared/buffer";
import type { S3BackupSettings } from "@shared/types/backup";
import type { BackupManifest, BackupSnapshotInfo } from "@shared/types/backup";
import { parseSnapshotZip } from "../snapshot";
import type { BackupRemoteProvider, LatestPointer } from "./types";

export class S3BackupProvider implements BackupRemoteProvider {
  constructor(private settings: S3BackupSettings) {}

  async testConnection(): Promise<void> {
    await this.listAllObjects(`${this.snapshotsPrefix()}/`);
  }

  async listSnapshots(): Promise<BackupSnapshotInfo[]> {
    const prefix = `${this.snapshotsPrefix()}/`;
    const keys = await this.listAllObjects(prefix);
    const snapshotIds = new Set<string>();

    for (const key of keys) {
      const rest = key.slice(prefix.length);
      const id = rest.split("/")[0];
      if (id) snapshotIds.add(id);
    }

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
        // skip incomplete snapshots
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
    await this.putObject(
      this.objectKey(snapshotId, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    await this.putObject(
      this.objectKey(snapshotId, "snapshot.zip"),
      zipBytes,
      "application/zip",
    );
  }

  async downloadSnapshot(snapshotId: string): Promise<{
    manifest: BackupManifest;
    zipBytes: Uint8Array;
  }> {
    const zipBytes = await this.getObject(
      this.objectKey(snapshotId, "snapshot.zip"),
    );
    const parsed = parseSnapshotZip(zipBytes);
    return { manifest: parsed.manifest, zipBytes };
  }

  async downloadLatestPointer(): Promise<LatestPointer | null> {
    try {
      const bytes = await this.getObject(this.latestKey());
      return JSON.parse(new TextDecoder().decode(bytes)) as LatestPointer;
    } catch {
      return null;
    }
  }

  async writeLatestPointer(pointer: LatestPointer): Promise<void> {
    await this.putObject(this.latestKey(), JSON.stringify(pointer, null, 2));
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    await this.deleteObject(this.objectKey(snapshotId, "manifest.json"));
    await this.deleteObject(this.objectKey(snapshotId, "snapshot.zip"));
  }

  private async downloadManifest(snapshotId: string): Promise<BackupManifest> {
    const bytes = await this.getObject(
      this.objectKey(snapshotId, "manifest.json"),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as BackupManifest;
  }

  private snapshotsPrefix(): string {
    const prefix = this.settings.prefix.replace(/\/$/, "");
    return `${prefix}/snapshots`;
  }

  private objectKey(snapshotId: string, name: string): string {
    return `${this.snapshotsPrefix()}/${snapshotId}/${name}`;
  }

  private latestKey(): string {
    const prefix = this.settings.prefix.replace(/\/$/, "");
    return `${prefix}/latest.json`;
  }

  private bucketUrl(): string {
    const endpoint = this.settings.endpoint.replace(/\/$/, "");
    const bucket = this.settings.bucket;
    if (this.settings.forcePathStyle) {
      return `${endpoint}/${bucket}`;
    }
    const host = endpoint.replace(/^https?:\/\//, "");
    return `https://${bucket}.${host}`;
  }

  private objectUrl(key: string): string {
    const encodedKey = key
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `${this.bucketUrl()}/${encodedKey}`;
  }

  private async putObject(
    key: string,
    body: string | Uint8Array,
    contentType = "application/json",
  ): Promise<void> {
    const bytes =
      typeof body === "string" ? new TextEncoder().encode(body) : body;
    const url = this.objectUrl(key);
    const headers = await signS3Request(this.settings, "PUT", url, bytes, {
      "content-type": contentType,
    });

    const response = await requestUrl({
      url,
      method: "PUT",
      headers,
      body: toArrayBuffer(bytes),
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`S3 PUT failed (${response.status}): ${response.text}`);
    }
  }

  private async getObject(key: string): Promise<Uint8Array> {
    const url = this.objectUrl(key);
    const headers = await signS3Request(
      this.settings,
      "GET",
      url,
      new Uint8Array(),
      {},
    );

    const response = await requestUrl({
      url,
      method: "GET",
      headers,
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`S3 GET failed (${response.status}): ${response.text}`);
    }

    return new Uint8Array(response.arrayBuffer);
  }

  private async deleteObject(key: string): Promise<void> {
    const url = this.objectUrl(key);
    const headers = await signS3Request(
      this.settings,
      "DELETE",
      url,
      new Uint8Array(),
      {},
    );

    const response = await requestUrl({
      url,
      method: "DELETE",
      headers,
      throw: false,
    });

    if (response.status >= 400 && response.status !== 404) {
      throw new Error(`S3 DELETE failed (${response.status}): ${response.text}`);
    }
  }

  private async listAllObjects(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const page = await this.listObjectsPage(prefix, 1000, continuationToken);
      keys.push(...page.keys);
      continuationToken = page.isTruncated ? page.nextToken : undefined;
    } while (continuationToken);

    return keys;
  }

  private async listObjectsPage(
    prefix: string,
    maxKeys: number,
    continuationToken?: string,
  ): Promise<{ keys: string[]; isTruncated: boolean; nextToken?: string }> {
    const url = new URL(this.bucketUrl());
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max-keys", String(maxKeys));
    if (continuationToken) {
      url.searchParams.set("continuation-token", continuationToken);
    }

    const headers = await signS3Request(
      this.settings,
      "GET",
      url.toString(),
      new Uint8Array(),
      {},
    );

    const response = await requestUrl({
      url: url.toString(),
      method: "GET",
      headers,
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`S3 LIST failed (${response.status}): ${response.text}`);
    }

    const keys: string[] = [];
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(response.text))) {
      keys.push(match[1]);
    }

    const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(response.text);
    const tokenMatch = response.text.match(
      /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/,
    );

    return {
      keys,
      isTruncated,
      nextToken: tokenMatch?.[1],
    };
  }
}

async function signS3Request(
  settings: S3BackupSettings,
  method: string,
  url: string,
  body: Uint8Array,
  extraHeaders: Record<string, string>,
): Promise<Record<string, string>> {
  const parsed = new URL(url);
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const region = settings.region || "us-east-1";
  const payloadHash = await sha256Hex(body);

  const headerMap: Record<string, string> = {
    host: parsed.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
  };

  const signedHeaderKeys = Object.keys(headerMap).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headerMap[k]}\n`)
    .join("");

  const canonicalQuery = [...parsed.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    method,
    parsed.pathname || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSignatureKey(
    settings.secretAccessKey,
    dateStamp,
    region,
    "s3",
  );
  const signature = await hmacHex(signingKey, stringToSign);

  const output: Record<string, string> = {};
  for (const key of signedHeaderKeys) {
    if (key === "host") output.Host = headerMap.host;
    else if (key === "x-amz-content-sha256") output["X-Amz-Content-Sha256"] = payloadHash;
    else if (key === "x-amz-date") output["X-Amz-Date"] = amzDate;
    else output[key] = headerMap[key];
  }

  output.Authorization = `AWS4-HMAC-SHA256 Credential=${settings.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return output;
}

async function getSignatureKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  return hmacRaw(kService, "aws4_request");
}

async function hmacRaw(
  key: ArrayBuffer | ArrayBufferView,
  data: string,
): Promise<ArrayBuffer> {
  const keyBytes = new Uint8Array(toArrayBuffer(key));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmacRaw(key, data);
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
