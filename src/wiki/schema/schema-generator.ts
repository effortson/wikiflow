import { parseMarkdown } from "@shared/frontmatter";
import {
  defaultWikiSchema,
  type WikiSchemaConfig,
} from "@shared/types/wiki-schema";
import type { WikiInstance } from "@shared/types/wiki-instance";
import {
  normalizeWikiLanguage,
  wikiLanguageAnalysisInstruction,
  wikiLanguageSchemaTagInstruction,
  type WikiLanguage,
} from "@shared/wiki-language";
import { parseLlmJson } from "@shared/parse-llm-json";
import type { LLMService } from "../../core/llm/llm-service";
import type { VaultAdapter } from "../../core/vault/vault-adapter";
import { parseWikiFlowSource } from "../source/source-markdown";
import { SchemaManager } from "./schema-manager";

const MAX_SOURCE_FILES = 8;
const MAX_CHARS_PER_FILE = 6_000;
const MAX_TOTAL_CHARS = 48_000;

export interface GenerateSchemaResult {
  config: WikiSchemaConfig;
  path: string;
  mode: "default" | "generated";
  sourceFileCount: number;
}

export interface GenerateSchemaDeps {
  vault: VaultAdapter;
  llm: LLMService;
  getLanguage: () => WikiLanguage;
}

export async function generateWikiSchema(
  deps: GenerateSchemaDeps,
  wiki: WikiInstance,
): Promise<GenerateSchemaResult> {
  const manager = new SchemaManager(deps.vault, deps.getLanguage);
  const samples = await collectSourceSamples(deps.vault, wiki);
  const configPath = `${wiki.schemaRoot}/config.md`;

  const language = normalizeWikiLanguage(deps.getLanguage());

  if (!samples.length) {
    const config: WikiSchemaConfig = {
      ...defaultWikiSchema(language),
      wikiId: wiki.wikiId,
    };
    await manager.save(
      wiki,
      config,
      defaultSchemaBody(wiki.wikiId, "default", language),
    );
    return {
      config,
      path: configPath,
      mode: "default",
      sourceFileCount: 0,
    };
  }

  const config = await suggestSchemaFromSources(
    deps.llm,
    wiki.wikiId,
    samples,
    language,
  );
  await manager.save(
    wiki,
    config,
    defaultSchemaBody(wiki.wikiId, "generated", language),
  );

  return {
    config,
    path: configPath,
    mode: "generated",
    sourceFileCount: samples.length,
  };
}

async function suggestSchemaFromSources(
  llm: LLMService,
  wikiId: string,
  samples: SourceSample[],
  language: WikiLanguage,
): Promise<WikiSchemaConfig> {
  const catalog = samples
    .map(
      (s, i) =>
        `### [${i + 1}] ${s.path}\n${s.excerpt}`,
    )
    .join("\n\n");

  const system = `You design wiki schema vocabularies for knowledge extraction.
Respond with ONLY valid JSON:
{
  "entityTags": ["string"],
  "conceptTags": ["string"],
  "customEntityTags": ["string"],
  "customConceptTags": ["string"]
}
Rules:
- ${wikiLanguageSchemaTagInstruction(language)}
- entityTags/conceptTags: core vocabulary for this domain; include sensible defaults for the domain.
- customEntityTags/customConceptTags: domain-specific extensions.
- Each list must have at least 2 items.
${wikiLanguageAnalysisInstruction(language)}`;

  const user = `WikiId: ${wikiId}

Source markdown samples (${samples.length} files):
${catalog.slice(0, MAX_TOTAL_CHARS)}`;

  const raw = await llm.chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    jsonMode: true,
    temperature: 0.1,
  });

  const parsed = parseSchemaJson(raw);
  return normalizeGeneratedSchema(wikiId, parsed, language);
}

export function normalizeGeneratedSchema(
  wikiId: string,
  data: Partial<WikiSchemaConfig>,
  language: WikiLanguage = "zh",
): WikiSchemaConfig {
  const defaults = defaultWikiSchema(language);
  return {
    schemaVersion: 1,
    wikiId,
    entityTags: nonEmptyTags(data.entityTags, defaults.entityTags),
    conceptTags: nonEmptyTags(data.conceptTags, defaults.conceptTags),
    customEntityTags: dedupeTags(data.customEntityTags ?? []),
    customConceptTags: dedupeTags(data.customConceptTags ?? []),
    entityResolution: {
      matchBy: ["exact-name", "alias"],
      onConflict: "merge-to-existing",
    },
  };
}

interface SourceSample {
  path: string;
  excerpt: string;
}

async function collectSourceSamples(
  vault: VaultAdapter,
  wiki: WikiInstance,
): Promise<SourceSample[]> {
  const allPaths = await listMarkdownRecursive(vault, wiki.sourceRoot);
  const samples: SourceSample[] = [];

  for (const path of allPaths.slice(0, MAX_SOURCE_FILES)) {
    if (!(await vault.exists(path))) continue;
    const raw = await vault.readText(path);
    const { meta, body } = parseWikiFlowSource(raw);
    const plain = meta ? body : parseMarkdown(raw).body;
    const excerpt = plain.trim().slice(0, MAX_CHARS_PER_FILE);
    if (!excerpt) continue;
    samples.push({ path, excerpt });
  }
  return samples;
}

async function listMarkdownRecursive(
  vault: VaultAdapter,
  root: string,
): Promise<string[]> {
  if (!(await vault.exists(root))) return [];

  const out: string[] = [];
  const walk = async (dir: string) => {
    for (const child of vault.listFolder(dir)) {
      if (child.endsWith(".md")) out.push(child);
      else await walk(child);
    }
  };
  await walk(root);
  return out.sort();
}

function parseSchemaJson(raw: string): Partial<WikiSchemaConfig> {
  return parseLlmJson<Partial<WikiSchemaConfig>>(raw);
}

function nonEmptyTags(value: string[] | undefined, fallback: string[]): string[] {
  const tags = dedupeTags(value ?? []);
  return tags.length ? tags : [...fallback];
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = String(tag).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function defaultSchemaBody(
  wikiId: string,
  mode: "default" | "generated",
  language: WikiLanguage,
): string {
  if (language === "zh") {
    if (mode === "default") {
      return `\n# Wiki Schema：${wikiId}\n\n\`source/${wikiId}/\` 下暂无 Markdown，已写入**中文**默认标签词汇表。\n\n修改 frontmatter 中的标签后，重新执行「Source → Wiki：当前 Wiki 全部」即可生效。\n`;
    }
    return `\n# Wiki Schema：${wikiId}\n\n已根据 \`source/${wikiId}/\` 内容生成**中文**标签词汇表。修改 frontmatter 后重新摄取即可应用。\n`;
  }

  if (mode === "default") {
    return `\n# Wiki schema: ${wikiId}\n\nNo source markdown under \`source/${wikiId}/\`. Default English tag vocabulary was written.\n\nEdit frontmatter tags, then re-run **Source → Wiki: active wiki (all files)**.\n`;
  }
  return `\n# Wiki schema: ${wikiId}\n\nGenerated English tag vocabulary from \`source/${wikiId}/\`. Edit frontmatter and re-ingest to apply.\n`;
}
