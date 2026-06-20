/** Extract and parse JSON from LLM responses with light repair for common mistakes. */

export function parseLlmJson<T>(raw: string): T {
  const candidates = buildJsonCandidates(raw);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Failed to parse LLM JSON: ${lastError?.message ?? "unknown error"}`,
  );
}

function buildJsonCandidates(raw: string): string[] {
  const extracted = extractJsonFromLlmResponse(raw);
  const repaired = repairJsonCommonIssues(extracted);
  const unique = new Set<string>();
  for (const text of [extracted, repaired, raw.trim()]) {
    if (text) unique.add(text);
  }
  return [...unique];
}

export function extractJsonFromLlmResponse(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();

  const balanced = extractBalancedObject(raw);
  if (balanced) return balanced;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function extractBalancedObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }

  return null;
}

export function repairJsonCommonIssues(text: string): string {
  let s = text.trim();
  s = s.replace(/^\uFEFF/, "");
  s = stripJsonComments(s);
  s = s.replace(/[\u201c\u201d]/g, '"');
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  return s.trim();
}

/**
 * Remove `//` line comments and block comments, but only outside string
 * literals \u2014 a naive regex would corrupt values like "https://example.com".
 */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      i--; // let the loop re-handle the newline (or end)
      continue;
    }

    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++; // skip past the closing '*' ; the loop's i++ skips the '/'
      continue;
    }

    out += ch;
  }

  return out;
}
