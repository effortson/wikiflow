import { describe, expect, it } from "vitest";
import { NODE_CATALOG } from "../src/workflow/ui/node-schemas";
import {
  getNodeCategory,
  getNodeCategoryClass,
  getNodeSubtitle,
  NODE_STATUS_LABEL,
} from "../src/workflow/ui/node-theme";

describe("node theme", () => {
  it("maps every catalog type to a category class", () => {
    for (const entry of NODE_CATALOG) {
      expect(getNodeCategory(entry.type)).toBe(entry.category);
      expect(getNodeCategoryClass(entry.type)).toMatch(/^ef-node-cat--/);
      expect(getNodeSubtitle(entry.type)).toBeTruthy();
    }
  });

  it("labels node statuses", () => {
    expect(NODE_STATUS_LABEL.ready).toBe("Ready");
    expect(NODE_STATUS_LABEL.running).toBe("Running");
  });
});
