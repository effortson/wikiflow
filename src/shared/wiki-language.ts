export type WikiLanguage = "zh" | "en";

export const DEFAULT_WIKI_LANGUAGE: WikiLanguage = "zh";

export const WIKI_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: WikiLanguage;
  label: string;
}> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export function normalizeWikiLanguage(
  value: string | undefined | null,
): WikiLanguage {
  return value === "en" ? "en" : "zh";
}

export function wikiLanguageLabel(language: WikiLanguage): string {
  return language === "zh" ? "中文（简体）" : "English";
}

/** Instruction for schema tag vocabulary generation. */
export function wikiLanguageSchemaTagInstruction(language: WikiLanguage): string {
  if (language === "zh") {
    return "所有 entityTags / conceptTags / custom*Tags 必须使用简体中文标签（与 Wiki 语言一致），例如：机构、指标、标准、流程。不要使用英文 slug。";
  }
  return "All entityTags / conceptTags / custom*Tags MUST use lowercase English slug labels (e.g. organization, metric, standard, process).";
}

/** Instruction for structured wiki analysis (summary, entities, concepts). */
export function wikiLanguageAnalysisInstruction(language: WikiLanguage): string {
  if (language === "zh") {
    return "所有生成内容（summary、keyPoints、实体/概念名称与 summary）必须使用简体中文撰写；引用原文时可保留原文措辞。";
  }
  return "All generated fields (summary, keyPoints, entity/concept names and summaries) MUST be written in English; keep verbatim quotes in the source language when citing.";
}

/** Prompt for PDF page vision transcription. */
export function wikiLanguagePdfVisionPrompt(language: WikiLanguage): string {
  if (language === "zh") {
    return "请转录本页所有可见文字与图表数据，按阅读顺序输出纯文本。若有表格，用 Markdown 表格格式；若有图表（柱状图、折线图、分级图等），用文字描述坐标轴、图例与各数据点/等级的数值。保持文档原文语言（中文文档输出中文）。";
  }
  return "Transcribe all visible text and chart data on this page. Output plain text in reading order. Use markdown tables for tabular data; for charts (bar, line, rating scales), describe axes, legends, and data point or grade values in text.";
}

/** Prompt for standalone image vision extraction. */
export function wikiLanguageImageVisionPrompt(language: WikiLanguage): string {
  if (language === "zh") {
    return "描述图片内容并转录所有可见文字。使用 Markdown 小节：视觉摘要、转录文字。描述与转录均使用简体中文（原文为英文时可保留英文）。";
  }
  return "Describe this image and transcribe any visible text. Use markdown sections: Visual summary, Transcribed text.";
}

/** Instruction appended to wiki Q&A system prompt. */
export function wikiLanguageQueryInstruction(language: WikiLanguage): string {
  return language === "zh"
    ? "请使用简体中文回答。"
    : "Answer in English.";
}

export function wikiLanguageQueryNoPagesError(language: WikiLanguage): string {
  return language === "zh"
    ? "未找到与该问题相关的 Wiki 页面。"
    : "No relevant wiki pages found for this question.";
}

export function wikiLanguageTablesSectionHeading(language: WikiLanguage): string {
  return language === "zh" ? "## 表格与图表数据" : "## Tables and chart data";
}

export function wikiLanguageTableAnalysisInstruction(
  language: WikiLanguage,
): string {
  if (language === "zh") {
    return `文档中的 Markdown 表格、分级标准、能效/等级指标必须完整提取：
- 表头中的指标名（如「能效等级」「等级划分」）应作为概念（concept）单独建档，summary 须包含各级别标准或数值区间。
- 表格行数据写入 keyPoints（保留等级名称与对应条件/数值）。
- 实体与表格相关的，mentions.quote 应引用含该实体行的表格片段。`;
  }
  return `Extract markdown tables, rating scales, and metric definitions completely:
- Column headers that denote metrics or classifications (e.g. efficiency grades) must become concepts with full level definitions in summary.
- Put table row facts into keyPoints (level names and thresholds/values).
- For entities tied to table rows, mention quotes should include the relevant table excerpt.`;
}
