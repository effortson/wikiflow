import { normalizePath } from "obsidian";
import type { WikiId } from "@shared/types/wiki-instance";

/** Whether `path` is under `folder/{wikiId}/` or deeper. */
export function isUnderWikiFolder(
  path: string,
  folder: string,
  wikiId?: WikiId,
): boolean {
  const normalized = normalizePath(path);
  const root = normalizePath(folder);
  const prefix = root.endsWith("/") ? root : `${root}/`;
  if (!normalized.startsWith(prefix)) return false;
  if (!wikiId) return true;
  const rest = normalized.slice(prefix.length);
  return rest === wikiId || rest.startsWith(`${wikiId}/`);
}

export function isUnderFolder(path: string, folder: string): boolean {
  const normalized = normalizePath(path);
  const root = normalizePath(folder);
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return normalized === root || normalized.startsWith(prefix);
}

/** Map `raw/{wikiId}/a/b.pdf` → `source/{wikiId}/a/b.md` */
export function sourcePathForRaw(
  rawPath: string,
  rawRoot: string,
  sourceRoot: string,
): string {
  const rel = normalizePath(rawPath).slice(normalizePath(rawRoot).length + 1);
  const dot = rel.lastIndexOf(".");
  const withoutExt = dot > 0 ? rel.slice(0, dot) : rel;
  return `${normalizePath(sourceRoot)}/${withoutExt}.md`;
}
