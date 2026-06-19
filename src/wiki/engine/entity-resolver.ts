import { slugify } from "@shared/slug";
import { parseMarkdown } from "@shared/frontmatter";
import type { WikiSchemaConfig } from "@shared/types/wiki-schema";
import type { EntityInfo, ConceptInfo } from "@shared/types/wiki";
import type { VaultAdapter } from "../../core/vault/vault-adapter";

export type WikiPageKind = "entity" | "concept";

export interface ResolvedPage {
  path: string;
  slug: string;
  isNew: boolean;
}

export class EntityResolver {
  constructor(private vault: VaultAdapter) {}

  async resolveEntity(
    wikiRoot: string,
    info: EntityInfo,
    _schema: WikiSchemaConfig,
  ): Promise<ResolvedPage> {
    return this.resolve(wikiRoot, "entities", info.name, info.aliases ?? []);
  }

  async resolveConcept(
    wikiRoot: string,
    info: ConceptInfo,
    _schema: WikiSchemaConfig,
  ): Promise<ResolvedPage> {
    return this.resolve(wikiRoot, "concepts", info.name, info.aliases ?? []);
  }

  private async resolve(
    wikiRoot: string,
    folder: string,
    name: string,
    aliases: string[],
  ): Promise<ResolvedPage> {
    const primarySlug = slugify(name);
    const primaryPath = `${wikiRoot}/${folder}/${primarySlug}.md`;

    if (await this.vault.exists(primaryPath)) {
      return { path: primaryPath, slug: primarySlug, isNew: false };
    }

    const byAlias = await this.findByAlias(wikiRoot, folder, name, aliases);
    if (byAlias) return { path: byAlias, slug: slugFromPath(byAlias), isNew: false };

    const slug = await this.allocateSlug(wikiRoot, folder, primarySlug);
    return {
      path: `${wikiRoot}/${folder}/${slug}.md`,
      slug,
      isNew: true,
    };
  }

  private async findByAlias(
    wikiRoot: string,
    folder: string,
    name: string,
    aliases: string[],
  ): Promise<string | null> {
    const names = new Set(
      [name, ...aliases].map((n) => n.toLowerCase().trim()),
    );
    const dir = `${wikiRoot}/${folder}`;
    if (!(await this.vault.exists(dir))) return null;

    for (const path of this.listMarkdown(dir)) {
      const raw = await this.vault.readText(path);
      const { frontmatter } = parseMarkdown(raw);
      const title = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
      if (names.has(title.toLowerCase())) return path;
      const fmAliases = frontmatter.aliases;
      if (Array.isArray(fmAliases)) {
        for (const a of fmAliases) {
          if (names.has(String(a).toLowerCase())) return path;
        }
      }
    }
    return null;
  }

  private async allocateSlug(
    wikiRoot: string,
    folder: string,
    base: string,
  ): Promise<string> {
    if (!(await this.vault.exists(`${wikiRoot}/${folder}/${base}.md`))) {
      return base;
    }
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base}-${i}`;
      if (!(await this.vault.exists(`${wikiRoot}/${folder}/${candidate}.md`))) {
        return candidate;
      }
    }
    throw new Error(`Cannot allocate slug for ${base}`);
  }

  private listMarkdown(folder: string): string[] {
    return this.vault
      .listFolder(folder)
      .filter((p) => p.endsWith(".md"));
  }
}

function slugFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? "untitled";
}
