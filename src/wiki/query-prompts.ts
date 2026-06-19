import type { WikiLanguage } from "@shared/wiki-language";
import { wikiLanguageQueryInstruction } from "@shared/wiki-language";

export const DEFAULT_QUERY_SYSTEM_PROMPT = `You answer questions using ONLY the provided wiki pages from wikiId "{{wikiId}}".
Cite sources using Obsidian wikilinks like [[wiki/{{wikiId}}/entities/example]].
If the context is insufficient, say so clearly.
{{languageInstruction}}`;

export const DEFAULT_QUERY_USER_PROMPT = `Question: {{question}}

Context pages:
{{context}}

Answer in markdown. Include [[wikilinks]] to cited pages.`;

export interface ResolveQueryPromptsInput {
  wikiId: string;
  question: string;
  context: string;
  language: WikiLanguage;
  systemPrompt?: string;
  userPrompt?: string;
}

export function resolveQueryPrompts(
  input: ResolveQueryPromptsInput,
): { system: string; user: string } {
  const vars: Record<string, string> = {
    wikiId: input.wikiId,
    question: input.question,
    context: input.context,
    languageInstruction: wikiLanguageQueryInstruction(input.language),
  };

  const systemTemplate =
    input.systemPrompt?.trim() || DEFAULT_QUERY_SYSTEM_PROMPT;
  const userTemplate = input.userPrompt?.trim() || DEFAULT_QUERY_USER_PROMPT;

  return {
    system: substituteQueryPrompt(systemTemplate, vars),
    user: substituteQueryPrompt(userTemplate, vars),
  };
}

export function substituteQueryPrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

export function effectiveQuerySystemPrompt(stored?: string): string {
  const trimmed = stored?.trim();
  return trimmed || DEFAULT_QUERY_SYSTEM_PROMPT;
}

export function effectiveQueryUserPrompt(stored?: string): string {
  const trimmed = stored?.trim();
  return trimmed || DEFAULT_QUERY_USER_PROMPT;
}
