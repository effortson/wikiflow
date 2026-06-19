import { describe, expect, it } from "vitest";
import {
  createEmptyWorkflow,
  createNodeFromCatalog,
  definitionToFlow,
  flowToDefinition,
} from "../src/workflow/ui/workflow-adapter";

describe("workflow adapter", () => {
  it("round-trips definition through flow nodes and edges", () => {
    const def = createEmptyWorkflow("demo", "Demo");
    const pick = createNodeFromCatalog("file.pick", { x: 200, y: 100 });
    const flow = definitionToFlow({
      ...def,
      nodes: [...def.nodes, { id: pick.id, type: "file.pick", position: pick.position, data: {} }],
      edges: [{ id: "e1", from: def.nodes[0].id, to: pick.id }],
    });

    const roundTrip = flowToDefinition(def, flow.nodes, flow.edges);
    expect(roundTrip.nodes).toHaveLength(2);
    expect(roundTrip.edges[0].from).toBe(def.nodes[0].id);
    expect(roundTrip.edges[0].to).toBe(pick.id);
  });

  it("preserves branch.if edge ports", () => {
    const def = createEmptyWorkflow();
    const branch = createNodeFromCatalog("branch.if", { x: 300, y: 100 });
    const flow = definitionToFlow({
      ...def,
      nodes: [...def.nodes, { id: branch.id, type: "branch.if", position: branch.position, data: {} }],
      edges: [
        {
          id: "e-true",
          from: branch.id,
          to: def.nodes[0].id,
          fromPort: "true",
        },
      ],
    });

    expect(flow.edges[0].sourceHandle).toBe("true");
    const restored = flowToDefinition(def, flow.nodes, flow.edges);
    expect(restored.edges[0].fromPort).toBe("true");
  });
});
