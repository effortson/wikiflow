export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseMarkdown(content: string): ParsedMarkdown {
  const match = content.match(FM_RE);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = parseSimpleYaml(match[1]);
  return { frontmatter, body: match[2] };
}

export function stringifyMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yaml = stringifySimpleYaml(frontmatter);
  const trimmedBody = body.startsWith("\n") ? body : `\n${body}`;
  return `---\n${yaml}---${trimmedBody}`;
}

/** Minimal YAML for frontmatter (no nested objects beyond arrays of strings). */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let listItems: string[] | null = null;

  const flushList = () => {
    if (currentKey && listItems) {
      result[currentKey] = listItems;
      listItems = null;
    }
  };

  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ")) {
      if (!listItems) listItems = [];
      listItems.push(parseScalar(trimmed.slice(2).trim()) as string);
      continue;
    }

    flushList();
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    currentKey = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!value) {
      listItems = [];
      continue;
    }
    result[currentKey] = parseScalar(value);
    currentKey = null;
  }

  flushList();
  return result;
}

function parseScalar(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "~") return null;
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  // Only coerce when the number round-trips exactly, so zero-padded ids
  // ("007") and integers beyond Number precision keep their string form.
  if (/^-?\d+$/.test(raw)) {
    const num = Number(raw);
    if (String(num) === raw) return num;
  }
  return raw;
}

function stringifySimpleYaml(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${formatScalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const s = String(value);
  if (/[:#\n]/.test(s) || s === "") return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
