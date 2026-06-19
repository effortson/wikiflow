import { describe, expect, it } from "vitest";
import {
  extractMarkdownTables,
  formatTablesSection,
  tablesRelevantToTerms,
} from "../src/shared/markdown-tables";

describe("markdown-tables", () => {
  it("extracts markdown table blocks", () => {
    const text = `前言

| 等级 | 条件 |
| --- | --- |
| 一级 | P≤3.0 |

其他文字

| 指标 | 值 |
| --- | --- |
| 能效 | 高 |`;

    const tables = extractMarkdownTables(text);
    expect(tables).toHaveLength(2);
    expect(tables[0]).toContain("一级");
    expect(tables[1]).toContain("能效");
  });

  it("filters tables relevant to search terms", () => {
    const text = `| 设备 | 能效等级 |
| --- | --- |
| 压缩空气站 | 一级 |

| 其他 | 数据 |
| --- | --- |
| X | Y |`;

    const relevant = tablesRelevantToTerms(text, ["压缩空气站"]);
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toContain("压缩空气站");
  });

  it("formats a tables section with heading", () => {
    const section = formatTablesSection(
      ["| A | B |\n| --- | --- |\n| 1 | 2 |"],
      "## 表格与图表数据",
    );
    expect(section).toContain("## 表格与图表数据");
    expect(section).toContain("| A | B |");
  });
});
