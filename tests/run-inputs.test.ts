import { describe, expect, it } from "vitest";
import {
  getUserInputPromptLabel,
  resolveWorkflowRunInputs,
} from "../src/workflow/ui/run-inputs";
import type { WorkflowDefinition } from "@shared/types/workflow";

const ragDef: WorkflowDefinition = {
  schemaVersion: 1,
  id: "rag",
  name: "RAG",
  nodes: [
    { id: "input", type: "trigger.user-input", position: { x: 0, y: 0 }, data: { prompt: "请输入你的问题" } },
    { id: "batch", type: "wiki.query-batch", position: { x: 0, y: 0 }, data: { wikiId: "{{wikiId}}", questions: "{{expand.text}}" } },
  ],
  edges: [],
};

describe("resolveWorkflowRunInputs", () => {
  it("requires prompt text for user-input workflows", () => {
    const result = resolveWorkflowRunInputs({
      def: ragDef,
      runPrompt: "  ",
      wikiIds: ["demo"],
    });
    expect(result.error).toContain("请先输入");
  });

  it("reads user-input prompt label from workflow", () => {
    expect(getUserInputPromptLabel(ragDef)).toBe("请输入你的问题");
    expect(
      getUserInputPromptLabel({
        ...ragDef,
        nodes: [{ id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: {} }],
      }),
    ).toBeUndefined();
  });

  it("passes text and active wiki id", () => {
    const result = resolveWorkflowRunInputs({
      def: ragDef,
      runPrompt: "如何节能",
      activeWikiId: "compressed-air",
      wikiIds: ["demo"],
    });
    expect(result.error).toBeUndefined();
    expect(result.inputs).toEqual({
      text: "如何节能",
      wikiId: "compressed-air",
    });
  });

  it("falls back to the only wiki when active wiki is unset", () => {
    const result = resolveWorkflowRunInputs({
      def: ragDef,
      runPrompt: "如何节能",
      wikiIds: ["demo"],
    });
    expect(result.inputs.wikiId).toBe("demo");
  });
});
