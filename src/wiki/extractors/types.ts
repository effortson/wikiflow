import type { CachedExtract } from "@shared/types/cached-extract";
import type { ContentHash } from "@shared/types/normalized-document";
import type { WikiId } from "@shared/types/wiki-instance";
import type { WikiLanguage } from "@shared/wiki-language";
import type { CoreServices } from "../../core/core-services";
import type { ExtractOptions } from "@shared/types/normalized-document";
import type { TFile } from "obsidian";

export interface ExtractContext {
  services: CoreServices;
  signal: AbortSignal;
  options: ExtractOptions;
  wikiId: WikiId;
  sourceId: string;
  contentHash: ContentHash;
  pluginVersion: string;
  language: WikiLanguage;
}

export interface DocumentExtractor {
  readonly id: string;
  readonly version: string;
  readonly extensions: string[];
  supports(file: TFile): boolean;
  extractToCache(file: TFile, ctx: ExtractContext): Promise<CachedExtract>;
}
