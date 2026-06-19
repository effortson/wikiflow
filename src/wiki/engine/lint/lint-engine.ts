import { parseMarkdown, stringifyMarkdown } from "@shared/frontmatter";
import { sourcePathForRaw } from "../../source/source-paths";
import type {
  LintIssue,
  LintOptions,
  LintReport,
  LintSeverity,
} from "@shared/types/wiki";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { WikiSchemaConfig } from "@shared/types/wiki-schema";
import type { WikiLanguage } from "@shared/wiki-language";
import type { VaultAdapter } from "../../../core/vault/vault-adapter";
import { SchemaManager } from "../../schema/schema-manager";
import { extractTitle } from "../query-catalog";
import { TFile, TFolder, type Vault } from "obsidian";

export class LintEngine {
  private schema: SchemaManager;

  constructor(
    private vault: VaultAdapter,
    private obsidianVault: Vault,
    private getLanguage?: () => WikiLanguage,
  ) {
    this.schema = new SchemaManager(vault, getLanguage);
  }

  async lint(wiki: WikiInstance, options: LintOptions = {}): Promise<LintReport> {
    const startedAt = new Date().toISOString();
    const schema = await this.schema.load(wiki);
    const issues: LintIssue[] = [];

    const pages = await this.collectWikiPages(wiki);
    const pageSet = new Set(pages);
    const pageBodies = await this.loadPageBodies(pages);

    issues.push(...this.checkMissingWikiId(wiki, pageBodies));
    issues.push(...this.checkDeadLinks(pageBodies, pageSet));
    issues.push(...this.checkAliasCollisions(pageBodies));
    issues.push(...this.checkDuplicateEntities(pageBodies));
    issues.push(...this.checkOrphanPages(wiki, pages, pageBodies));
    issues.push(...this.checkSchemaViolations(pageBodies, schema));
    issues.push(...(await this.checkRawSourcePairs(wiki, pageBodies)));

    if (options.autoFix) {
      await this.autoFix(issues, wiki);
    }

    const bySeverity: Record<LintSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
    };
    for (const issue of issues) {
      bySeverity[issue.severity]++;
    }

    const report: LintReport = {
      wikiId: wiki.wikiId,
      startedAt,
      finishedAt: new Date().toISOString(),
      issues,
      stats: {
        pagesScanned: pages.length,
        rawFilesScanned: this.countRawFiles(wiki),
        bySeverity,
      },
    };

    return report;
  }

  private async collectWikiPages(wiki: WikiInstance): Promise<string[]> {
    const folders = ["sources", "entities", "concepts"];
    const pages: string[] = [];
    for (const folder of folders) {
      const dir = `${wiki.wikiRoot}/${folder}`;
      if (!(await this.vault.exists(dir))) continue;
      pages.push(
        ...this.vault.listFolder(dir).filter((p: string) => p.endsWith(".md")),
      );
    }
    return pages;
  }

  private async loadPageBodies(
    pages: string[],
  ): Promise<Map<string, { frontmatter: Record<string, unknown>; body: string }>> {
    const map = new Map<
      string,
      { frontmatter: Record<string, unknown>; body: string }
    >();
    for (const pagePath of pages) {
      const raw = await this.vault.readText(pagePath);
      const parsed = parseMarkdown(raw);
      map.set(pagePath, parsed);
    }
    return map;
  }

  private checkMissingWikiId(
    wiki: WikiInstance,
    pageBodies: Map<string, { frontmatter: Record<string, unknown>; body: string }>,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const [pagePath, { frontmatter }] of pageBodies) {
      if (frontmatter.wikiId !== wiki.wikiId) {
        issues.push({
          code: "missing_wiki_id",
          severity: "error",
          message: `Expected wikiId "${wiki.wikiId}", got "${String(frontmatter.wikiId)}"`,
          pagePath,
          fixable: true,
        });
      }
    }
    return issues;
  }

  private checkDeadLinks(
    pageBodies: Map<string, { frontmatter: Record<string, unknown>; body: string }>,
    pageSet: Set<string>,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const linkRe = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

    for (const [pagePath, { body }] of pageBodies) {
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(body))) {
        const target = match[1].trim();
        const withMd = target.endsWith(".md") ? target : `${target}.md`;
        const exists =
          pageSet.has(withMd) ||
          pageSet.has(target) ||
          this.obsidianVault.getAbstractFileByPath(target) !== null ||
          this.obsidianVault.getAbstractFileByPath(withMd) !== null;
        if (!exists) {
          issues.push({
            code: "dead_link",
            severity: "warning",
            message: `Dead link to [[${target}]]`,
            pagePath,
            relatedPaths: [target],
            fixable: false,
          });
        }
      }
    }
    return issues;
  }

  private checkAliasCollisions(
    pageBodies: Map<string, { frontmatter: Record<string, unknown>; body: string }>,
  ): LintIssue[] {
    const aliasMap = new Map<string, string[]>();
    for (const [pagePath, { frontmatter, body }] of pageBodies) {
      const aliases = Array.isArray(frontmatter.aliases)
        ? frontmatter.aliases.map(String)
        : [];
      const title = extractTitle(body, pagePath);
      for (const name of [title, ...aliases]) {
        const key = name.toLowerCase();
        const list = aliasMap.get(key) ?? [];
        list.push(pagePath);
        aliasMap.set(key, list);
      }
    }

    const issues: LintIssue[] = [];
    for (const [alias, paths] of aliasMap) {
      const unique = [...new Set(paths)];
      if (unique.length > 1) {
        issues.push({
          code: "alias_collision",
          severity: "warning",
          message: `Alias "${alias}" used on multiple pages`,
          relatedPaths: unique,
          fixable: false,
        });
      }
    }
    return issues;
  }

  private checkDuplicateEntities(
    pageBodies: Map<string, { frontmatter: Record<string, unknown>; body: string }>,
  ): LintIssue[] {
    const byTitle = new Map<string, string[]>();
    for (const [pagePath, { frontmatter, body }] of pageBodies) {
      if (!pagePath.includes("/entities/")) continue;
      const title = extractTitle(body, pagePath).toLowerCase();
      const names = [
        title,
        ...(Array.isArray(frontmatter.aliases)
          ? frontmatter.aliases.map((a) => String(a).toLowerCase())
          : []),
      ];
      for (const name of names) {
        const list = byTitle.get(name) ?? [];
        list.push(pagePath);
        byTitle.set(name, list);
      }
    }

    const issues: LintIssue[] = [];
    for (const [name, paths] of byTitle) {
      const unique = [...new Set(paths)];
      if (unique.length > 1) {
        issues.push({
          code: "duplicate_entity",
          severity: "warning",
          message: `Duplicate entity name "${name}"`,
          relatedPaths: unique,
          fixable: false,
        });
      }
    }
    return issues;
  }

  private checkOrphanPages(
    wiki: WikiInstance,
    pages: string[],
    pageBodies: Map<string, { frontmatter: Record<string, unknown>; body: string }>,
  ): LintIssue[] {
    const inbound = new Map<string, number>();
    for (const p of pages) inbound.set(p, 0);

    const linkRe = /\[\[([^\]|#]+)/g;
    for (const [, { body }] of pageBodies) {
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(body))) {
        const target = match[1].trim();
        const normalized = target.endsWith(".md") ? target : `${target}.md`;
        if (inbound.has(normalized)) {
          inbound.set(normalized, (inbound.get(normalized) ?? 0) + 1);
        }
      }
    }

    const indexPath = `${wiki.wikiRoot}/index.md`;
    const issues: LintIssue[] = [];
    for (const pagePath of pages) {
      if (pagePath === indexPath) continue;
      if ((inbound.get(pagePath) ?? 0) === 0) {
        issues.push({
          code: "orphan_page",
          severity: "info",
          message: "No incoming wikilinks",
          pagePath,
          fixable: false,
        });
      }
    }
    return issues;
  }

  private checkSchemaViolations(
    pageBodies: Map<string, { frontmatter: Record<string, unknown>; body: string }>,
    schema: WikiSchemaConfig,
  ): LintIssue[] {
    const allowedTags = new Set([
      ...schema.entityTags,
      ...schema.conceptTags,
      ...schema.customEntityTags,
      ...schema.customConceptTags,
    ]);
    const issues: LintIssue[] = [];

    for (const [pagePath, { frontmatter }] of pageBodies) {
      const tags = Array.isArray(frontmatter.tags)
        ? frontmatter.tags.map(String)
        : [];
      for (const tag of tags) {
        if (tag && !allowedTags.has(tag)) {
          issues.push({
            code: "schema_violation",
            severity: "warning",
            message: `Tag "${tag}" not in schema vocabulary`,
            pagePath,
            fixable: false,
          });
        }
      }
    }
    return issues;
  }

  private async checkRawSourcePairs(
    wiki: WikiInstance,
    pageBodies: Map<string, { frontmatter: Record<string, unknown>; body: string }>,
  ): Promise<LintIssue[]> {
    const issues: LintIssue[] = [];
    const referencedSourceMd = new Set<string>();

    for (const [pagePath, { frontmatter }] of pageBodies) {
      if (!pagePath.includes("/sources/")) continue;
      const sources = Array.isArray(frontmatter.sources)
        ? frontmatter.sources.map(String)
        : [];
      for (const sourceId of sources) {
        referencedSourceMd.add(sourceId);
        if (!(await this.vault.exists(sourceId))) {
          issues.push({
            code: "source_without_raw",
            severity: "error",
            message: `Wiki source page references missing source markdown: ${sourceId}`,
            pagePath,
            relatedPaths: [sourceId],
            fixable: false,
          });
        }
      }
    }

    for (const rawPath of this.listRawFiles(wiki)) {
      const sourceMd = sourcePathForRaw(rawPath, wiki.rawRoot, wiki.sourceRoot);
      if (!(await this.vault.exists(sourceMd))) {
        issues.push({
          code: "raw_without_source",
          severity: "warning",
          message: `Raw file has no converted source markdown: ${sourceMd}`,
          relatedPaths: [rawPath, sourceMd],
          fixable: false,
        });
        continue;
      }
      if (!referencedSourceMd.has(sourceMd)) {
        issues.push({
          code: "raw_without_source",
          severity: "info",
          message: `Source markdown not ingested to wiki: ${sourceMd}`,
          relatedPaths: [rawPath, sourceMd],
          fixable: false,
        });
      }
    }

    return issues;
  }

  private listRawFiles(wiki: WikiInstance): string[] {
    const root = this.obsidianVault.getAbstractFileByPath(wiki.rawRoot);
    if (!(root instanceof TFolder)) return [];
    const files: string[] = [];
    const walk = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile) files.push(child.path);
        else if (child instanceof TFolder) walk(child);
      }
    };
    walk(root);
    return files;
  }

  private countRawFiles(wiki: WikiInstance): number {
    return this.listRawFiles(wiki).length;
  }

  private async autoFix(issues: LintIssue[], wiki: WikiInstance): Promise<void> {
    for (const issue of issues) {
      if (!issue.fixable || issue.code !== "missing_wiki_id" || !issue.pagePath) {
        continue;
      }
      const raw = await this.vault.readText(issue.pagePath);
      const parsed = parseMarkdown(raw);
      parsed.frontmatter.wikiId = wiki.wikiId;
      await this.vault.writeText(
        issue.pagePath,
        stringifyMarkdown(parsed.frontmatter, parsed.body),
      );
    }
  }
}
