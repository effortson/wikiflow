import { describe, expect, it } from "vitest";
import {
  extractJsonFromLlmResponse,
  parseLlmJson,
  repairJsonCommonIssues,
} from "../src/shared/parse-llm-json";

describe("parse-llm-json", () => {
  it("parses fenced JSON", () => {
    const data = parseLlmJson<{ summary: string }>(
      'Here is the result:\n```json\n{"summary":"ok"}\n```',
    );
    expect(data.summary).toBe("ok");
  });

  it("repairs trailing commas", () => {
    const repaired = repairJsonCommonIssues(
      '{"entities":[{"name":"A",},],"summary":"x",}',
    );
    const data = parseLlmJson<{ summary: string; entities: unknown[] }>(
      repaired,
    );
    expect(data.summary).toBe("x");
    expect(data.entities).toHaveLength(1);
  });

  it("repairs unquoted property names", () => {
    const repaired = repairJsonCommonIssues(
      '{summary:"hello",keyPoints:[],entities:[],concepts:[],contradictions:[]}',
    );
    const data = parseLlmJson<{ summary: string }>(repaired);
    expect(data.summary).toBe("hello");
  });

  it("extracts first balanced JSON object from noisy text", () => {
    const extracted = extractJsonFromLlmResponse(
      'prefix {"a":1,"b":{"c":2}} suffix {"ignored":true}',
    );
    expect(extracted).toBe('{"a":1,"b":{"c":2}}');
  });
});
