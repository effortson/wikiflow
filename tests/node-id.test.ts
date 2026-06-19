import { describe, expect, it } from "vitest";
import {
  applyNodeIdChange,
  createNodeFromCatalog,
  createEdgeId,
} from "../src/workflow/ui/workflow-adapter";
import {
  defaultNodeId,
  isValidNodeId,
  resolveNodeId,
  rewriteNodeIdInConfig,
} from "../src/workflow/ui/node-id";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeData } from "../src/workflow/ui/workflow-adapter";

function makeNode(id: string, type = "llm.chat"): Node<WorkflowNodeData> {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: {
      nodeType: type,
      label: type,
      config: { user: `{{${id}.text}}` },
    },
  };
}

describe("node-id helpers", () => {
  it("generates stable default ids", () => {
    expect(defaultNodeId("wiki.query-batch", new Set())).toBe("wiki-query-batch");
    expect(defaultNodeId("wiki.query-batch", new Set(["wiki-query-batch"]))).toBe(
      "wiki-query-batch-2",
    );
  });

  it("validates node id format", () => {
    expect(isValidNodeId("expand")).toBe(true);
    expect(isValidNodeId("1bad")).toBe(false);
    expect(isValidNodeId("bad id")).toBe(false);
  });

  it("uses default when draft is empty", () => {
    const result = resolveNodeId("llm.chat", "", new Set(["expand"]));
    expect(result.id).toBe("llm-chat");
    expect(result.error).toBeUndefined();
  });

  it("rewrites template references in config", () => {
    expect(
      rewriteNodeIdInConfig({ user: "{{expand.text}}" }, "expand", "queries"),
    ).toEqual({ user: "{{queries.text}}" });
  });
});

describe("applyNodeIdChange", () => {
  it("renames node, edges, and downstream templates", () => {
    const nodes = [
      makeNode("expand"),
      {
        ...makeNode("summarize"),
        data: {
          ...makeNode("summarize").data,
          config: { user: "{{expand.text}}" },
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: createEdgeId("expand", "summarize"),
        source: "expand",
        target: "summarize",
      },
    ];

    const result = applyNodeIdChange(nodes, edges, "expand", "queries");
    expect(result.error).toBeUndefined();
    expect(result.newId).toBe("queries");
    expect(result.nodes.find((node) => node.id === "queries")).toBeTruthy();
    expect(result.nodes.find((node) => node.id === "summarize")?.data.config).toEqual({
      user: "{{queries.text}}",
    });
    expect(result.edges[0]?.source).toBe("queries");
    expect(result.edges[0]?.target).toBe("summarize");
  });

  it("rejects duplicate ids", () => {
    const nodes = [makeNode("expand"), makeNode("summarize")];
    const result = applyNodeIdChange(nodes, [], "expand", "summarize");
    expect(result.error).toContain("already in use");
    expect(result.newId).toBe("expand");
  });
});

describe("createNodeFromCatalog", () => {
  it("assigns default id from node type", () => {
    const node = createNodeFromCatalog("trigger.user-input", { x: 0, y: 0 }, [
      "trigger-user-input",
    ]);
    expect(node.id).toBe("trigger-user-input-2");
  });
});
