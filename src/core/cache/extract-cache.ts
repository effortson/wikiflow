import type { CachedExtract, ExtractCacheMeta } from "@shared/types/cached-extract";
import type { ContentHash } from "@shared/types/normalized-document";
import type { PluginSettings } from "../config/settings";
import { VaultAdapter } from "../vault/vault-adapter";

const EXTRACTS_ROOT = ".wikiflow/extracts";
const REFERENCED_BY_LIMIT = 32;

export class ExtractCache {
  constructor(
    private vault: VaultAdapter,
    private getSettings: () => PluginSettings,
  ) {}

  private hashDir(contentHash: ContentHash): string {
    return `${EXTRACTS_ROOT}/${contentHash}`;
  }

  async get(contentHash: ContentHash): Promise<CachedExtract | null> {
    if (!this.getSettings().extractCacheEnabled) return null;
    const dir = this.hashDir(contentHash);
    const extractPath = `${dir}/extract.json`;
    if (!(await this.vault.exists(extractPath))) return null;
    const raw = await this.vault.readText(extractPath);
    let cached: CachedExtract;
    try {
      cached = JSON.parse(raw) as CachedExtract;
    } catch {
      return null;
    }
    if (!this.isValidEntry(cached)) return null;
    return cached;
  }

  /** Validates schema + metadata presence; extractor version checked via registry. */
  isValidEntry(cached: CachedExtract): boolean {
    return cached.schemaVersion === 1 && Boolean(cached.metadata?.extractorId);
  }

  async put(contentHash: ContentHash, extract: CachedExtract): Promise<void> {
    const dir = this.hashDir(contentHash);
    await this.vault.mkdir(dir);
    await this.vault.writeText(
      `${dir}/extract.json`,
      JSON.stringify(extract, null, 2),
    );
    await this.vault.writeText(`${dir}/full.md`, extract.fullText);

    const meta: ExtractCacheMeta = {
      contentHash,
      extractedAt: extract.metadata.extractedAt,
      extractorId: extract.metadata.extractorId,
      extractorVersion: extract.metadata.extractorVersion,
      pluginVersion: extract.metadata.pluginVersion,
      referencedBy: [],
    };
    await this.vault.writeText(
      `${dir}/meta.json`,
      JSON.stringify(meta, null, 2),
    );
  }

  async recordReference(
    contentHash: ContentHash,
    sourceId: string,
  ): Promise<void> {
    const metaPath = `${this.hashDir(contentHash)}/meta.json`;
    if (!(await this.vault.exists(metaPath))) return;

    let meta: ExtractCacheMeta;
    try {
      meta = JSON.parse(
        await this.vault.readText(metaPath),
      ) as ExtractCacheMeta;
    } catch {
      return;
    }
    const refs = new Set(meta.referencedBy ?? []);
    refs.add(sourceId);
    meta.referencedBy = [...refs].slice(-REFERENCED_BY_LIMIT);
    await this.vault.writeText(metaPath, JSON.stringify(meta, null, 2));
  }
}
