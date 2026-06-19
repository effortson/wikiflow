import { describe, expect, it } from "vitest";
import { normalizeWorkflowDefinition } from "../src/workflow/schema/normalize-workflow";
import { definitionToFlow, flowToDefinition, createEmptyWorkflow } from "../src/workflow/ui/workflow-adapter";

describe("normalize-workflow", () => {
  it("normalizes legacy source/target edge fields", () => {
    const def = createEmptyWorkflow("demo", "Demo");
    const pickId = "pick-1";
    const normalized = normalizeWorkflowDefinition({
      ...def,
      nodes: [
        ...def.nodes,
        { id: pickId, type: "file.pick", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        {
          id: "e1",
          from: def.nodes[0].id,
          to: pickId,
          source: def.nodes[0].id,
          target: pickId,
        } as never,
      ],
    });

    expect(normalized.edges).toHaveLength(1);
    expect(normalized.edges[0].from).toBe(def.nodes[0].id);
    expect(normalized.edges[0].to).toBe(pickId);
  });

  it("drops edges that reference missing nodes", () => {
    const def = createEmptyWorkflow();
    const normalized = normalizeWorkflowDefinition({
      ...def,
      edges: [{ id: "bad", from: "missing", to: def.nodes[0].id }],
    });
    expect(normalized.edges).toHaveLength(0);
  });
});

describe("workflow edge round-trip", () => {
  it("preserves default-handle edges without null sourceHandle", () => {
    const def = createEmptyWorkflow("demo", "Demo");
    const pickId = "pick-1";
    const withEdge = {
      ...def,
      nodes: [
        ...def.nodes,
        { id: pickId, type: "file.pick", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: "e1", from: def.nodes[0].id, to: pickId }],
    };

    const flow = definitionToFlow(withEdge);
    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0].sourceHandle).toBeUndefined();
    expect(flow.edges[0].targetHandle).toBeUndefined();

    const restored = flowToDefinition(def, flow.nodes, flow.edges);
    expect(restored.edges).toEqual(withEdge.edges);
  });
});
