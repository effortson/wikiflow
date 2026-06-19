import {
  defaultWikiSchema,
  type WikiSchemaConfig,
} from "@shared/types/wiki-schema";
import type { WikiLanguage } from "@shared/wiki-language";
import { normalizeWikiLanguage } from "@shared/wiki-language";
import { parseMarkdown, stringifyMarkdown } from "@shared/frontmatter";
import type { VaultAdapter } from "../../core/vault/vault-adapter";
import type { WikiInstance } from "@shared/types/wiki-instance";

export class SchemaManager {
  constructor(
    private vault: VaultAdapter,
    private getLanguage?: () => WikiLanguage,
  ) {}

  async load(wiki: WikiInstance): Promise<WikiSchemaConfig> {
    const language = normalizeWikiLanguage(this.getLanguage?.());
    const defaults = defaultWikiSchema(language);
    const configPath = `${wiki.schemaRoot}/config.md`;
    if (!(await this.vault.exists(configPath))) {
      const config = { ...defaults, wikiId: wiki.wikiId };
      await this.save(wiki, config);
      return config;
    }

    const raw = await this.vault.readText(configPath);
    const { frontmatter } = parseMarkdown(raw);
    return {
      ...defaults,
      ...frontmatter,
      wikiId: wiki.wikiId,
    } as WikiSchemaConfig;
  }

  async save(
    wiki: WikiInstance,
    config: WikiSchemaConfig,
    body = "",
  ): Promise<void> {
    await this.ensureSchemaDir(wiki);
    const configPath = `${wiki.schemaRoot}/config.md`;
    await this.vault.writeText(
      configPath,
      stringifyMarkdown(
        { ...config, wikiId: wiki.wikiId } as unknown as Record<string, unknown>,
        body.startsWith("\n") ? body : `\n${body}`,
      ),
    );
  }

  private async ensureSchemaDir(wiki: WikiInstance): Promise<void> {
    await this.vault.mkdir(wiki.schemaRoot);
  }
}
