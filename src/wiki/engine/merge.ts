import {
  DEFAULT_PAGE_MERGE_RULES,
  type MergePolicy,
  type PageMergeRules,
} from "@shared/types/wiki";
import { parseMarkdown, stringifyMarkdown } from "@shared/frontmatter";

export interface MergePageInput {
  existingContent: string | null;
  incomingFrontmatter: Record<string, unknown>;
  incomingBody: string;
  incomingMentionsBlock: string;
  incomingSummary: string;
  mergePolicy: MergePolicy;
}

export interface MergePageResult {
  content: string;
  skippedBody: boolean;
}

export function mergeWikiPage(input: MergePageInput): MergePageResult {
  const rules = resolveBodyRules(input.mergePolicy);
  const existing = input.existingContent
    ? parseMarkdown(input.existingContent)
    : null;

  const reviewed = existing?.frontmatter.reviewed === true;
  const fm = { ...input.incomingFrontmatter };

  if (existing) {
    fm.sources = unionStrings(
      existing.frontmatter.sources,
      input.incomingFrontmatter.sources,
    );
    fm.aliases = unionStrings(
      existing.frontmatter.aliases,
      input.incomingFrontmatter.aliases,
    );
    fm.updated = maxDate(
      String(existing.frontmatter.updated ?? ""),
      String(input.incomingFrontmatter.updated ?? ""),
    );
    fm.created = existing.frontmatter.created ?? fm.created;
  }

  let body: string;
  let skippedBody = false;

  if (!existing) {
    body = buildBody(input.incomingSummary, input.incomingBody, input.incomingMentionsBlock, rules);
  } else if (reviewed) {
    body = existing.body;
    skippedBody = true;
    body = applyMentionsMerge(
      body,
      input.incomingMentionsBlock,
      rules.mentionsSection,
    );
    body = applySummaryMerge(
      body,
      input.incomingSummary,
      rules.summary === "fill-if-empty" ? "fill-if-empty" : rules.summary,
    );
  } else if (input.mergePolicy === "skip") {
    body = existing.body;
    skippedBody = true;
    body = applyMentionsMerge(body, input.incomingMentionsBlock, "append");
  } else if (input.mergePolicy === "overwrite") {
    body = buildBody(input.incomingSummary, input.incomingBody, input.incomingMentionsBlock, {
      ...rules,
      mentionsSection: "replace",
      summary: "replace",
    });
  } else {
    body = applySummaryMerge(existing.body, input.incomingSummary, "fill-if-empty");
    body = applyMentionsMerge(body, input.incomingMentionsBlock, "append");
    if (input.incomingBody.trim()) {
      body = `${body.trim()}\n\n${input.incomingBody.trim()}\n`;
    }
  }

  return {
    content: stringifyMarkdown(fm, body),
    skippedBody,
  };
}

function resolveBodyRules(mergePolicy: MergePolicy): PageMergeRules {
  const base = { ...DEFAULT_PAGE_MERGE_RULES };
  if (mergePolicy === "overwrite") {
    return { ...base, body: "overwrite", mentionsSection: "replace", summary: "replace" };
  }
  if (mergePolicy === "skip") {
    return { ...base, body: "skip" };
  }
  return base;
}

function buildBody(
  summary: string,
  body: string,
  mentions: string,
  rules: PageMergeRules,
): string {
  const parts: string[] = [];
  if (summary.trim()) parts.push(summary.trim());
  if (body.trim()) parts.push(body.trim());
  if (mentions.trim()) parts.push(mentions.trim());
  void rules;
  return parts.length ? `\n${parts.join("\n\n")}\n` : "\n";
}

function applyMentionsMerge(
  body: string,
  incomingBlock: string,
  mode: "append" | "replace",
): string {
  if (!incomingBlock.trim()) return body;
  const header = "## Mentions in Source";
  const idx = body.indexOf(header);

  if (mode === "replace" || idx === -1) {
    if (idx === -1) {
      return `${body.trim()}\n\n${incomingBlock.trim()}\n`;
    }
    const before = body.slice(0, idx).trimEnd();
    return `${before}\n\n${incomingBlock.trim()}\n`;
  }

  const existingBlock = body.slice(idx);
  const merged = dedupeMentionLines(existingBlock, incomingBlock);
  return `${body.slice(0, idx).trimEnd()}\n\n${merged.trim()}\n`;
}

function dedupeMentionLines(a: string, b: string): string {
  const lines = new Set<string>();
  for (const block of [a, b]) {
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (t.startsWith("- ")) lines.add(t);
    }
  }
  return ["## Mentions in Source", ...[...lines].sort()].join("\n");
}

function applySummaryMerge(
  body: string,
  summary: string,
  mode: "fill-if-empty" | "replace",
): string {
  if (!summary.trim()) return body;
  const trimmed = body.trim();
  if (mode === "replace" || !trimmed) {
    return `\n${summary.trim()}\n\n${trimmed}\n`.replace(/\n{3,}/g, "\n\n");
  }
  if (trimmed.startsWith(summary.trim())) return body;
  return `\n${summary.trim()}\n\n${trimmed}\n`;
}

function unionStrings(a: unknown, b: unknown): string[] {
  const toArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string" && v) return [v];
    return [];
  };
  return [...new Set([...toArr(a), ...toArr(b)])];
}

function maxDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}
