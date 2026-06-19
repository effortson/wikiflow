import { describe, expect, it } from "vitest";
import {
  buildPageTextFromFragments,
  groupIntoLines,
  parseTextFragments,
  splitLineIntoCells,
  type TextFragment,
} from "../../src/wiki/extractors/pdf-layout";

function frag(
  text: string,
  x: number,
  y: number,
  width = 20,
  height = 10,
): TextFragment {
  return { text, x, y, width, height };
}

describe("pdf-layout", () => {
  it("groups fragments into lines by y coordinate", () => {
    const lines = groupIntoLines([
      frag("A", 10, 100),
      frag("B", 40, 100),
      frag("C", 10, 80),
    ]);
    expect(lines).toHaveLength(2);
    expect(splitLineIntoCells(lines[0]).join(" ")).toContain("A");
    expect(splitLineIntoCells(lines[1])).toEqual(["C"]);
  });

  it("splits wide horizontal gaps into table cells", () => {
    const cells = splitLineIntoCells({
      y: 100,
      fragments: [
        frag("列1", 10, 100, 24),
        frag("列2", 120, 100, 24),
        frag("列3", 230, 100, 24),
      ],
    });
    expect(cells).toEqual(["列1", "列2", "列3"]);
  });

  it("formats consecutive multi-column rows as markdown tables", () => {
    const result = buildPageTextFromFragments([
      frag("标题", 10, 200, 80),
      frag("Name", 10, 180, 40),
      frag("Value", 140, 180, 40),
      frag("Alpha", 10, 160, 40),
      frag("1", 140, 160, 10),
      frag("Beta", 10, 140, 40),
      frag("2", 140, 140, 10),
    ]);

    expect(result.tableCount).toBe(1);
    expect(result.text).toContain("| Name | Value |");
    expect(result.text).toContain("| Alpha | 1 |");
    expect(result.text).toContain("标题");
  });

  it("parses pdf.js style text items", () => {
    const result = buildPageTextFromFragments(
      parseTextFragments([
        {
          str: "A",
          transform: [1, 0, 0, 1, 10, 100],
          width: 8,
          height: 10,
        },
        {
          str: "B",
          transform: [1, 0, 0, 1, 120, 100],
          width: 8,
          height: 10,
        },
      ]),
    );
    expect(result.text).toContain("A");
    expect(result.text).toContain("B");
  });
});
