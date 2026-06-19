const LINE_PREFIX_RE = /^\s*(?:\d+[.)]\s*|[-*•]\s+)+/;
const META_LINE_RE = /^(the user|i need to|let me|okay,|sure,)/i;

import { stripLlmNoise } from "@shared/strip-llm-noise";

export { stripLlmNoise };

export interface WikiQueryResult {
  question: string;
  answer: string;
}

export function coerceQuestionSource(
  configured: unknown,
  inputs: Record<string, unknown> = {},
): unknown {
  const fromConfig = unwrapQuestionsValue(configured);
  if (fromConfig !== undefined) return fromConfig;

  for (const key of ["questions", "text", "summary", "input"]) {
    const candidate = unwrapQuestionsValue(inputs[key]);
    if (candidate !== undefined) return candidate;
  }

  return configured;
}

function unwrapQuestionsValue(value: unknown): string | string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    const stripped = stripLlmNoise(value);
    return stripped || undefined;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.questions)) {
      return record.questions.map((item) => String(item));
    }
    for (const key of ["text", "summary", "input", "questions"]) {
      const nested = unwrapQuestionsValue(record[key]);
      if (nested !== undefined) return nested;
    }
  }

  return undefined;
}

export function parseMaxQuestions(value: unknown, fallback = 5): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/** Normalize LLM text, JSON array, or string[] into deduped question lines. */
export function parseQuestionsInput(
  value: unknown,
  maxQuestions = 5,
): string[] {
  const items = coerceQuestionItems(value);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const question = normalizeQuestionLine(item);
    if (!isLikelyQuestionLine(question)) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(question);
    if (out.length >= maxQuestions) break;
  }

  return out;
}

function coerceQuestionItems(value: unknown): string[] {
  const unwrapped = unwrapQuestionsValue(value);
  if (unwrapped !== undefined) {
    value = unwrapped;
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = stripLlmNoise(value);
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      // fall through to line split
    }
  }

  return trimmed.split(/\r?\n/);
}

function normalizeQuestionLine(line: string): string {
  return line.replace(LINE_PREFIX_RE, "").trim();
}

function isLikelyQuestionLine(line: string): boolean {
  if (!line) return false;
  if (META_LINE_RE.test(line)) return false;
  if (line.startsWith("<") && line.includes("thinking")) return false;
  return true;
}

export function formatWikiQueryResults(results: WikiQueryResult[]): string {
  return results
    .map((entry, index) => {
      const header = `### ${index + 1}. ${entry.question}`;
      return `${header}\n\n${entry.answer}`;
    })
    .join("\n\n");
}
