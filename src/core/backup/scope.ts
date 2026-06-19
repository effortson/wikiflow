import { normalizePath, type TFile, type Vault } from "obsidian";
import type { BackupScope } from "@shared/types/backup";
import { matchGlob } from "@shared/glob";

export const DEFAULT_EXCLUDES = [
  ".obsidian/workspace.json",
  ".obsidian/workspace-mobile.json",
  ".obsidian/plugins/**/data.json",
  ".trash/**",
  "**/.DS_Store",
];

export interface ScopePaths {
  rawFolder: string;
  sourceFolder: string;
  wikiRoot: string;
  schemaRoot: string;
  workflowsFolder: string;
}

export interface ScopeOptions {
  scope: BackupScope;
  includeExtractCache: boolean;
  excludePatterns: string[];
  paths: ScopePaths;
}

export function listFilesInScope(
  vault: Vault,
  options: ScopeOptions,
): TFile[] {
  const excludes = [...DEFAULT_EXCLUDES, ...options.excludePatterns];
  return vault.getFiles().filter((file) => {
    const path = normalizePath(file.path);
    if (isExcluded(path, excludes)) return false;
    return isInScope(path, options);
  });
}

export function isInScope(path: string, options: ScopeOptions): boolean {
  const normalized = normalizePath(path);

  if (options.scope === "full") {
    return true;
  }

  const prefixes = [
    normalizePath(options.paths.rawFolder),
    normalizePath(options.paths.sourceFolder),
    normalizePath(options.paths.wikiRoot),
    normalizePath(options.paths.schemaRoot),
    normalizePath(options.paths.workflowsFolder),
    ".enterpriseflow",
  ];

  const inPrefix = prefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
  if (!inPrefix) return false;

  if (
    !options.includeExtractCache &&
    (normalized === ".enterpriseflow/extracts" ||
      normalized.startsWith(".enterpriseflow/extracts/"))
  ) {
    return false;
  }

  return true;
}

function isExcluded(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchGlob(path, pattern));
}
