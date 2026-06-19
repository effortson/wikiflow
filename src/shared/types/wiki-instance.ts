export type WikiId = string;

export interface WikiInstance {
  wikiId: WikiId;
  rawRoot: string;
  sourceRoot: string;
  wikiRoot: string;
  schemaRoot: string;
}
