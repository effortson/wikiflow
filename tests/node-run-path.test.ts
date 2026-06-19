import { describe, expect, it } from "vitest";
import { buildRoundedRectPerimeterPath } from "../src/workflow/ui/node-run-path";

describe("buildRoundedRectPerimeterPath", () => {
  it("starts at the top edge and traces a rounded rectangle", () => {
    const path = buildRoundedRectPerimeterPath(3, 3, 224, 96, 18);
    expect(path.startsWith("M 21 3")).toBe(true);
    expect(path).toContain("H 209");
    expect(path).toContain("V 81");
    expect(path).not.toContain("Z");
  });
});
