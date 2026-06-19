/** Layout-aware PDF text reconstruction (pdf.js coordinates). */

export interface TextFragment {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLine {
  fragments: TextFragment[];
  y: number;
}

export interface LayoutPageResult {
  text: string;
  tableCount: number;
}

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export function parseTextFragments(items: unknown[]): TextFragment[] {
  const fragments: TextFragment[] = [];
  for (const raw of items) {
    const item = raw as PdfTextItem;
    const text = item.str?.trim();
    if (!text) continue;
    const transform = item.transform;
    if (!transform || transform.length < 6) continue;
    fragments.push({
      text,
      x: transform[4],
      y: transform[5],
      width: item.width ?? 0,
      height: item.height ?? 0,
    });
  }
  return fragments;
}

export function groupIntoLines(fragments: TextFragment[]): TextLine[] {
  if (!fragments.length) return [];

  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const heights = sorted.map((f) => f.height).filter((h) => h > 0);
  const tolerance = Math.max(median(heights) * 0.65, 2.5);

  const lines: TextLine[] = [];
  let current: TextFragment[] = [];
  let currentY = sorted[0].y;

  for (const fragment of sorted) {
    if (Math.abs(fragment.y - currentY) <= tolerance) {
      current.push(fragment);
      continue;
    }
    if (current.length) {
      lines.push({ fragments: current, y: currentY });
    }
    current = [fragment];
    currentY = fragment.y;
  }

  if (current.length) {
    lines.push({ fragments: current, y: currentY });
  }

  return lines;
}

export function splitLineIntoCells(line: TextLine): string[] {
  const fragments = [...line.fragments].sort((a, b) => a.x - b.x);
  if (!fragments.length) return [];

  const heights = fragments.map((f) => f.height).filter((h) => h > 0);
  const gapThreshold = Math.max(median(heights) * 1.35, 10);

  const cells: string[] = [];
  let current = fragments[0].text;
  let lastEnd = fragments[0].x + Math.max(fragments[0].width, 0);

  for (let i = 1; i < fragments.length; i++) {
    const fragment = fragments[i];
    const gap = fragment.x - lastEnd;
    if (gap > gapThreshold) {
      cells.push(current.trim());
      current = fragment.text;
    } else {
      current = `${current}${gap > gapThreshold * 0.25 ? " " : ""}${fragment.text}`;
    }
    lastEnd = Math.max(lastEnd, fragment.x + Math.max(fragment.width, 0));
  }

  cells.push(current.trim());
  return cells.filter((cell) => cell.length > 0);
}

export function buildPageTextFromFragments(
  fragments: TextFragment[],
): LayoutPageResult {
  const lines = groupIntoLines(fragments);
  const rowCells = lines.map(splitLineIntoCells);
  const parts: string[] = [];
  let tableCount = 0;
  let index = 0;

  while (index < rowCells.length) {
    const cells = rowCells[index];
    if (!isTableRow(cells)) {
      parts.push(cells.join(" "));
      index++;
      continue;
    }

    let end = index;
    while (end < rowCells.length && isTableRow(rowCells[end])) {
      end++;
    }

    const block = rowCells.slice(index, end);
    if (block.length >= 2 && isStableTableBlock(block)) {
      const columnCount = modeColumnCount(block);
      const table = block.map((row) => padCells(row, columnCount));
      parts.push(formatMarkdownTable(table));
      tableCount++;
    } else {
      parts.push(block.map((row) => row.join("\t")).join("\n"));
    }

    index = end;
  }

  return {
    text: parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n\n"),
    tableCount,
  };
}

export function buildPageTextFromPdfItems(items: unknown[]): LayoutPageResult {
  return buildPageTextFromFragments(parseTextFragments(items));
}

function isTableRow(cells: string[]): boolean {
  return cells.length >= 2;
}

function isStableTableBlock(block: string[][]): boolean {
  const counts = block.map((row) => row.length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min >= 2 && max - min <= 1;
}

function modeColumnCount(block: string[][]): number {
  const freq = new Map<number, number>();
  for (const row of block) {
    freq.set(row.length, (freq.get(row.length) ?? 0) + 1);
  }
  let best = 2;
  let bestCount = 0;
  for (const [cols, count] of freq) {
    if (count > bestCount || (count === bestCount && cols > best)) {
      best = cols;
      bestCount = count;
    }
  }
  return best;
}

function padCells(row: string[], columnCount: number): string[] {
  const copy = [...row];
  while (copy.length < columnCount) copy.push("");
  return copy.slice(0, columnCount);
}

function formatMarkdownTable(rows: string[][]): string {
  if (!rows.length) return "";
  const sanitized = rows.map((row) =>
    row.map((cell) =>
      cell.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim(),
    ),
  );
  const header = sanitized[0];
  const separator = `| ${header.map(() => "---").join(" | ")} |`;
  const body = sanitized
    .slice(1)
    .map((row) => `| ${row.join(" | ")} |`);
  return [`| ${header.join(" | ")} |`, separator, ...body].join("\n");
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
