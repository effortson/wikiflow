import { normalizePath } from "obsidian";
import type { WikiId, WikiInstance } from "@shared/types/wiki-instance";

/**
 * First path segment after rawFolder is wikiId.
 * Returns null for files directly under raw/ or paths outside raw/.
 */
export function resolveWikiId(
  sourcePath: string,
  rawFolder: string,
): WikiId | null {
  const normalized = normalizePath(sourcePath);
  const raw = normalizePath(rawFolder);
  const prefix = raw.endsWith("/") ? raw : `${raw}/`;

  if (!normalized.startsWith(prefix)) return null;

  const rest = normalized.slice(prefix.length);
  if (!rest) return null;

  const slash = rest.indexOf("/");
  if (slash === -1) {
    if (rest.includes(".")) return null;
    return rest;
  }

  const wikiId = rest.slice(0, slash);
  return wikiId || null;
}

export interface ListWikiInstancesOptions {
  rawFolder: string;
  sourceFolder: string;
  wikiRoot: string;
  schemaRoot: string;
  listDirectChildren: (folderPath: string) => string[];
  isFolder: (path: string) => boolean;
}

export function listWikiInstances(
  options: ListWikiInstancesOptions,
): WikiInstance[] {
  const raw = normalizePath(options.rawFolder);
  const source = normalizePath(options.sourceFolder);
  const children = options.listDirectChildren(raw);

  return children
    .filter((path) => options.isFolder(path))
    .map((path) => {
      const wikiId = path.split("/").pop()!;
      return {
        wikiId,
        rawRoot: `${raw}/${wikiId}`,
        sourceRoot: `${source}/${wikiId}`,
        wikiRoot: `${normalizePath(options.wikiRoot)}/${wikiId}`,
        schemaRoot: `${normalizePath(options.schemaRoot)}/${wikiId}`,
      };
    })
    .sort((a, b) => a.wikiId.localeCompare(b.wikiId));
}
