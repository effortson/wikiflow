/** Extract contiguous Markdown table blocks from text. */

export function extractMarkdownTables(text: string): string[] {
  const lines = text.split("\n");
  const tables: string[] = [];
  let block: string[] = [];

  const flush = (): void => {
    if (block.length >= 2 && isMarkdownTableBlock(block)) {
      tables.push(block.join("\n").trim());
    }
    block = [];
  };

  for (const line of lines) {
    if (isTableLine(line)) {
      block.push(line);
      continue;
    }
    flush();
  }
  flush();

  return tables;
}

export function tablesRelevantToTerms(
  text: string,
  terms: string[],
): string[] {
  const normalized = terms
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (!normalized.length) return [];

  return extractMarkdownTables(text).filter((table) =>
    normalized.some((term) => table.includes(term)),
  );
}

export function formatTablesSection(
  tables: string[],
  heading: string,
): string {
  if (!tables.length) return "";
  const unique = dedupeStrings(tables);
  return `\n${heading}\n\n${unique.join("\n\n")}\n`;
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.includes("|");
}

function isMarkdownTableBlock(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const hasSeparator = lines.some((line) =>
    /^\|\s*:?-{3,}/.test(line.trim()),
  );
  if (hasSeparator) return true;
  return lines.every((line) => isTableLine(line)) && lines.length >= 2;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
