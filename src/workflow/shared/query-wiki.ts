import type { WikiService } from "../../wiki/service";
import type { WikiQueryResult } from "./parse-questions";

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

/** Run wiki Q&A for multiple questions concurrently; output order matches input. */
export async function queryWikiAnswersBatch(
  wiki: WikiService,
  wikiId: string,
  questions: string[],
  signal: AbortSignal,
): Promise<WikiQueryResult[]> {
  return Promise.all(
    questions.map(async (question) => {
      try {
        const answer = await queryWikiAnswer(wiki, wikiId, question, signal);
        return { question, answer };
      } catch (err) {
        return {
          question,
          answer: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}
