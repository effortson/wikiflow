export type QueryChunk =
  | { kind: "text"; delta: string }
  | { kind: "citation"; path: string; locator?: string }
  | { kind: "done"; answer: string; citedPaths: string[] }
  | { kind: "error"; message: string };
