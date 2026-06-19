import { parseMarkdown, stringifyMarkdown } from "@shared/frontmatter";

export const EF_SOURCE_KEY = "enterpriseflowSource";

export interface EnterpriseSourceFrontmatter {
  enterpriseflowSource: true;
  wikiId: string;
  rawPath: string;
  rawContentHash: string;
  convertedAt: string;
  extractorId: string;
  extractorVersion: string;
}

export function buildSourceMarkdown(
  frontmatter: EnterpriseSourceFrontmatter,
  body: string,
): string {
  const trimmed = body.trim();
  const content = trimmed ? `\n${trimmed}\n` : "\n";
  return stringifyMarkdown(
    frontmatter as unknown as Record<string, unknown>,
    content,
  );
}

export function parseEnterpriseSource(content: string): {
  meta: EnterpriseSourceFrontmatter | null;
  body: string;
} {
  const { frontmatter, body } = parseMarkdown(content);
  if (frontmatter[EF_SOURCE_KEY] !== true) {
    return { meta: null, body };
  }
  return {
    meta: {
      enterpriseflowSource: true,
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
