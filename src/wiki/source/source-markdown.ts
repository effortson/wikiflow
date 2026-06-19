import { parseMarkdown, stringifyMarkdown } from "@shared/frontmatter";
import {
  LEGACY_WIKIFLOW_SOURCE_KEY,
  WIKIFLOW_SOURCE_KEY,
} from "@shared/plugin-constants";

export { WIKIFLOW_SOURCE_KEY };

export interface WikiFlowSourceFrontmatter {
  wikiflowSource: true;
  wikiId: string;
  rawPath: string;
  rawContentHash: string;
  convertedAt: string;
  extractorId: string;
  extractorVersion: string;
}

export function buildSourceMarkdown(
  frontmatter: WikiFlowSourceFrontmatter,
  body: string,
): string {
  const trimmed = body.trim();
  const content = trimmed ? `\n${trimmed}\n` : "\n";
  return stringifyMarkdown(
    frontmatter as unknown as Record<string, unknown>,
    content,
  );
}

export function parseWikiFlowSource(content: string): {
  meta: WikiFlowSourceFrontmatter | null;
  body: string;
} {
  const { frontmatter, body } = parseMarkdown(content);
  const isSource =
    frontmatter[WIKIFLOW_SOURCE_KEY] === true ||
    frontmatter[LEGACY_WIKIFLOW_SOURCE_KEY] === true;
  if (!isSource) {
    return { meta: null, body };
  }
  return {
    meta: {
      wikiflowSource: true,
      wikiId: String(frontmatter.wikiId ?? ""),
      rawPath: String(frontmatter.rawPath ?? ""),
      rawContentHash: String(frontmatter.rawContentHash ?? ""),
      convertedAt: String(frontmatter.convertedAt ?? ""),
      extractorId: String(frontmatter.extractorId ?? ""),
      extractorVersion: String(frontmatter.extractorVersion ?? ""),
    },
    body,
  };
}
