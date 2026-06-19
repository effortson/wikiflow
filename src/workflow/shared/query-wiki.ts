import type { WikiService } from "../../wiki/service";

export async function queryWikiAnswer(
  wiki: WikiService,
  wikiId: string,
  question: string,
  signal: AbortSignal,
): Promise<string> {
  let answer = "";
  let errorMessage: string | undefined;

  for await (const chunk of wiki.query(wikiId, question)) {
    if (signal.aborted) {
      throw new Error("wiki query cancelled");
    }
    if (chunk.kind === "text") answer += chunk.delta;
    if (chunk.kind === "done") answer = chunk.answer;
    if (chunk.kind === "error") errorMessage = chunk.message;
  }

  if (errorMessage && !answer.trim()) {
    throw new Error(errorMessage);
  }

  return answer;
}
