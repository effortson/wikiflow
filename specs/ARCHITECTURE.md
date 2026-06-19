# EnterpriseFlow — 架构设计

> Obsidian 插件，包含两大能力：**文档 Wiki**（多格式摄取 → 结构化知识图谱）与 **工作流**（类 Dify 的可视化自动化）；共享核心另提供 **Vault 远程备份**（S3 或 GitHub **二选一**）。本文档定义跨模块共享契约、Vault 目录布局与模块边界。实现细节以代码为准；跨模块设计以本文件为权威来源。

**状态：** 草案 v0.6  
**最后更新：** 2026-06-18  
**适用范围：** 桌面版 Obsidian（**v1.11.0+**，依赖 `requestUrl`、桌面文件 API）。在抽取器无需原生二进制依赖之前，移动端不在范围内。

---

## 1. 目标与非目标

### 目标

1. 将 **raw/** 下的**原始文件**（PDF、Word、Excel、图片）摄取为带双向链接、索引与问答能力的 **Karpathy 风格 LLM Wiki**；**每个 raw 一级子目录对应一套完整、隔离的 Wiki 实例**。
2. 提供带可视化编辑器的工作流引擎，可编排抽取、Wiki 操作、LLM 调用与 Vault 动作；**工作流可嵌套调用子工作流**（组合复用，非复制粘贴）。
3. 两大模块共享同一套 **LLM 客户端**、**任务队列**、**Vault 适配器**与 **远程备份服务**（S3 或 GitHub，互斥配置）。

### 非目标（v0.x）

- 不替代 Obsidian 作为笔记编辑器。
- 工作流节点内不执行任意 JavaScript。
- 不支持工作流实时协同编辑。
- 首日不追求与 Dify 或 obsidian-llm-wiki 完全对等。
- 不支持移动端 Office/PDF 解析。
- **不支持**将 `raw/{wikiId}/` 的更深层子目录（二级及以下）注册为独立 Wiki；Wiki 边界**固定为 `raw/` 一级子目录**，不可配置。
- 不同时启用 S3 与 GitHub 备份（`backup.provider` 互斥，见 §19）。
- 不做 Obsidian Sync / 网盘的双向实时同步；备份为**手动或定时快照**（上传/下载）。

---

## 2. 系统总览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Obsidian 插件 (enterpriseflow)                 │
├─────────────────────────────────────────────────────────────────┤
│  UI 层                                                           │
│    设置 · Wiki 命令/视图 · 工作流画布 · 状态栏                      │
├──────────────┬──────────────────────────────┬───────────────────┤
│  模块 A      │         共享核心 (Core)        │    模块 B         │
│  文档 Wiki   │  LLM · 任务 · Vault · 备份 · 事件  │    工作流引擎      │
│              │  配置 · 缓存 · 日志                │                   │
└──────┬───────┴──────────────┬───────────────┴─────────┬─────────┘
       │                      │                         │
       ▼                      ▼                         ▼
  raw/{wikiId}/        插件数据 (data.json)        workflows/
  wiki/{wikiId}/       任务状态 · LLM 缓存 · 远程备份快照
  schema/{wikiId}/
```

**依赖规则：** `Workflow → Wiki → Core`。Wiki 不得 import Workflow。Core 不得 import Wiki 或 Workflow。

---

## 3. Vault 目录约定

所有路径均**相对于 Vault 根目录**。以下为默认名称，可在插件设置中配置。

### 3.1 多 Wiki 实例模型

**核心规则：`raw/` 下的每个一级子目录 = 一套完整、独立的 LLM Wiki。Wiki 边界仅有一层，不可加深。**

| 概念 | 说明 |
|------|------|
| **WikiId** | `raw/` **直接子目录**名（slug），如 `legal`、`product-rd` |
| **raw 根** | `raw/{wikiId}/` — 该 Wiki 的全部原始输入（只读） |
| **wiki 根** | `wiki/{wikiId}/` — 该 Wiki 生成的知识页 |
| **schema 根** | `schema/{wikiId}/` — 该 Wiki 的结构配置 |

**明确排除（非目标）：**

- `raw/legal/contracts/` **不是**独立 Wiki，`contracts` 只是 `legal` 内的整理子目录
- `raw/a/b/c/file.pdf` 归属 WikiId = `a`，与 `b`、`c` 无关
- 不存在「按深度可配置」「二级目录升格为 Wiki」等机制

同一 Vault 内可并存多套 Wiki，彼此**实体/概念/索引/问答上下文隔离**；跨 Wiki 链接不做自动维护。

```
raw/                          # 原始文件根（可配置 rawFolder）
  legal/                      # wikiId = "legal"
    contracts/agreement.pdf
    regulations/rule.docx
  product-rd/                 # wikiId = "product-rd"
    specs/feature-a.pdf
    images/diagram.png

wiki/                         # 生成知识根（可配置 wikiRoot）
  legal/
    entities/
    concepts/
    sources/
    index.md
    log.md
  product-rd/
    entities/
    concepts/
    sources/
    index.md
    log.md

schema/                       # 结构配置根（可配置 schemaRoot）
  legal/config.md
  product-rd/config.md
```

`raw/{wikiId}/` **内部可任意分级**（按项目、年份、格式等建子目录），仅用于组织源文件；**不改变 WikiId，也不会产生嵌套 Wiki**。格式路由器仍按扩展名与 MIME 识别文件类型。

**禁止：** 在 `raw/` 根目录直接放置源文件（必须位于某个 `{wikiId}/` 子目录下）。启动扫描或 Lint 时对违规文件给出迁移提示。

### 3.2 用户可见目录

| 路径模式 | 用途 | 写入方 | 用户可编辑？ |
|----------|------|--------|-------------|
| `raw/{wikiId}/**` | 该 Wiki 的原始源文件 | 用户（或同步） | 是 — 只读输入 |
| `wiki/{wikiId}/` | 该 Wiki 的知识页根 | 插件 | 是 — 受 `reviewed: true` 保护 |
| `wiki/{wikiId}/entities/` | 实体页 | 插件 | 是 |
| `wiki/{wikiId}/concepts/` | 概念页 | 插件 | 是 |
| `wiki/{wikiId}/sources/` | 源文件摘要页 | 插件 | 是 |
| `wiki/{wikiId}/index.md` | 该 Wiki 索引 | 插件 | `ingest` / `ingestWiki` 完成后重写；手动「重建索引」命令亦会刷新 |
| `wiki/{wikiId}/log.md` | 该 Wiki 操作日志 | 插件 | 仅追加 |
| `schema/{wikiId}/` | 该 Wiki 结构配置 | 插件 + 用户 | 是 |
| `schema/{wikiId}/config.md` | 主 Schema 文档 | 插件（默认）+ 用户 | 是 |
| `workflows/` | 工作流定义（`*.workflow.json`） | 用户 + 插件 | 是 |

### 3.3 内部 / 缓存目录

| 路径 | 用途 | 写入方 | 用户可编辑？ |
|------|------|--------|-------------|
| `.enterpriseflow/` | 插件内部状态 | 插件 | 否 |
| `.enterpriseflow/extracts/` | 按 `contentHash` 的全局抽取缓存（跨 Wiki 共享，**不含 wikiId**） | 插件 | 否 — 可安全删除 |
| `.enterpriseflow/index/` | 按 `wikiId` 的 Query 检索目录（见 §5.4） | 插件 | 否 — 可随 `regenerateIndex` 重建 |
| `.enterpriseflow/runs/` | 工作流运行记录（`{rootRunId}/` 树形目录，含子运行） | 插件 | 否 |
| `.enterpriseflow/jobs/` | 任务队列快照（可选） | 插件 | 否 |

抽取缓存按**文件内容哈希**全局共享：同一 PDF 出现在不同 Wiki 时只解析一次；**Wiki 路径维度（`wikiId`、`sourceId`）在绑定阶段注入**，见 §4.8。摄取与知识页仍按 `wikiId` 隔离写入。

### 3.4 WikiId 解析

```typescript
/** raw/ 直接子目录名，如 "legal"。固定一级，不可配置更深边界。 */
type WikiId = string;

interface WikiInstance {
  wikiId: WikiId;
  rawRoot: string;    // "raw/legal"
  wikiRoot: string;   // "wiki/legal"
  schemaRoot: string; // "schema/legal"
}

/**
 * 从源文件路径解析所属 Wiki。
 * 算法：取 rawFolder 之后的第一个路径段为 wikiId。
 * 无法解析时返回 null。
 */
function resolveWikiId(sourcePath: string, rawFolder: string): WikiId | null;
// "raw/legal/contracts/a.pdf"     → "legal"
// "raw/legal/a/b/c/report.pdf"    → "legal"（更深层仅作整理，不拆分 Wiki）
// "raw/foo.pdf"                   → null（违规：未在 wiki 子目录内）
// "raw/legal/contracts" 作为目录   → 不是 WikiId；"contracts" 永不成为 wikiId

function listWikiInstances(rawFolder: string, wikiRoot: string, schemaRoot: string): WikiInstance[];
// 仅枚举 raw/ 的直接子目录；不递归扫描更深层级
// 缺失的 wiki/、schema/ 目录在首次摄取时自动创建
```

### 3.5 路径规则

1. 摄取过程中**不得修改 `raw/` 下文件** — 只读输入。
2. **仅在 `wiki/{wikiId}/`** 下写入该 Wiki 的知识页；不得写入其他 `wikiId` 目录。
3. **Schema 变更**不得删除用户内容；迁移通过追加或配合 Lint 修复重命名。
4. 所有插件路径经 Obsidian `normalizePath()` 规范化。
5. Wiki 链接使用 Vault 相对路径：`[[wiki/legal/entities/acme-corp]]`。
6. 所有 Wiki 操作（摄取、Query、Lint、重建索引）必须显式或隐式携带 **`wikiId`**；不得假设全局单一 Wiki。

---

## 4. NormalizedDocument

`NormalizedDocument` 是格式抽取器与 Wiki 摄取流水线之间的**唯一契约**。每种支持的文件类型必须产出此结构（或返回拒绝错误）。

### 4.1 顶层类型

```typescript
/** Vault 内源文件的稳定标识。 */
type SourceId = string; // vault 路径，如 "raw/legal/contracts/report-q1.pdf"

/** 内容寻址缓存键。原始字节的 sha256。 */
type ContentHash = string;

interface NormalizedDocument {
  /** Schema 版本，用于向前兼容迁移。 */
  schemaVersion: 1;

  /** 所属 Wiki 实例（由 sourceId 解析）。 */
  wikiId: WikiId;

  /** 原始文件的 Vault 路径。 */
  sourceId: SourceId;

  /** 原始文件字节的 sha256(hex)。 */
  contentHash: ContentHash;

  /** MIME 类型，如 application/pdf。 */
  mimeType: string;

  /** 用于展示与 Wiki 源页的人类可读标题。 */
  title: string;

  /** 检测到的 BCP-47 语言；未检测则为 undefined。 */
  language?: string;

  /** 线性、利于 LLM 处理的全文（优先 markdown）。 */
  fullText: string;

  /** 用于分批 LLM 抽取的有序分块。 */
  chunks: DocumentChunk[];

  /** 抽取溯源信息 — 非 LLM 生成。 */
  metadata: ExtractMetadata;

  /** 可选警告（OCR 低置信度、表格截断等）。 */
  warnings?: ExtractWarning[];
}
```

### 4.2 分块 (Chunks)

```typescript
interface DocumentChunk {
  /** 文档内唯一，如 "chunk-003"。 */
  id: string;

  /** 分块纯文本或 markdown。 */
  text: string;

  /** 该分块在原始文件中的位置。 */
  locator: SourceLocator;

  /** 稳定排序序号（页码、sheet 行等）。 */
  sequence: number;

  /** 与 fullText 1:1 映射时的字符偏移；否则 undefined。 */
  charOffset?: number;

  /** 分块文本 sha256，用于增量重抽取。 */
  textHash?: string;
}
```

### 4.3 源定位器 (Source Locators)

定位器用于 Wiki 页面上的**引用字符串**（`p.12`、`Sheet: Revenue`、图片区域）。

```typescript
type SourceLocator =
  | PdfLocator
  | DocxLocator
  | XlsxLocator
  | ImageLocator
  | PlainLocator;

interface PdfLocator {
  kind: 'pdf';
  page: number;           // 从 1 起
  pageCount: number;
}

interface DocxLocator {
  kind: 'docx';
  section?: string;       // 可用时的标题文本
  paragraphIndex?: number;
}

interface XlsxLocator {
  kind: 'xlsx';
  sheet: string;
  range?: string;         // A1 表示法，如 "A1:D20"
  row?: number;
  col?: number;
}

interface ImageLocator {
  kind: 'image';
  width?: number;
  height?: number;
  region?: { x: number; y: number; w: number; h: number }; // 归一化 0–1
}

interface PlainLocator {
  kind: 'plain';
  label?: string;
}
```

### 4.4 抽取元数据

```typescript
interface ExtractMetadata {
  /** ISO-8601 时间戳。 */
  extractedAt: string;

  /** 抽取器插件 id，如 "pdf-text"、"docx-mammoth"、"image-vision"。 */
  extractorId: string;

  /** 抽取器 semver，用于缓存失效。 */
  extractorVersion: string;

  /** 产出此文档的插件版本。 */
  pluginVersion: string;

  /** 格式相关统计。 */
  stats: ExtractStats;
}

type ExtractStats =
  | { format: 'pdf'; pageCount: number; ocrUsed: boolean }
  | { format: 'docx'; paragraphCount?: number }
  | { format: 'xlsx'; sheetNames: string[]; rowCount?: number }
  | { format: 'image'; ocrUsed: boolean; visionModel?: string }
  | { format: 'plain' };
```

### 4.5 警告

```typescript
interface ExtractWarning {
  code:
    | 'truncated'
    | 'ocr_low_confidence'
    | 'empty_text'
    | 'password_protected'
    | 'unsupported_feature';
  message: string;
  locator?: SourceLocator;
}
```

### 4.6 磁盘缓存结构

缓存路径：`.enterpriseflow/extracts/{contentHash}/`

```
{contentHash}/
  extract.json       # CachedExtract（Wiki 无关，见 §4.8）
  full.md            # fullText 副本，便于调试
  meta.json          # 缓存元数据（不含 wikiId）
```

```typescript
/** 磁盘缓存中的 Wiki 无关抽取结果。 */
interface CachedExtract {
  schemaVersion: 1;
  contentHash: ContentHash;
  mimeType: string;
  /** 抽取时自文件名推导；绑定阶段可被 sourceId 覆盖。 */
  title: string;
  language?: string;
  fullText: string;
  chunks: DocumentChunk[];
  metadata: ExtractMetadata;
  warnings?: ExtractWarning[];
}

interface ExtractCacheMeta {
  contentHash: ContentHash;
  extractedAt: string;
  extractorId: string;
  extractorVersion: string;
  pluginVersion: string;
  /** 曾命中此缓存的 sourceId（审计用，非权威、可截断）。 */
  referencedBy?: SourceId[];
}
```

**缓存失效：** 当 `contentHash` 变化，或对应 `extractorId` 的 `extractorVersion` 升级，或 `CachedExtract.schemaVersion` 升级时，重新抽取。`pluginVersion` 单独变化不失效缓存。

### 4.7 序列化规则

1. `fullText` 为 UTF-8；不含 NUL 字节。
2. `chunks` 须覆盖可摄取内容；允许重叠分块以扩展上下文窗口。
3. **纯图片 / 扫描件文档**允许 `fullText` 为空；可读文本落在各 `DocumentChunk.text`（vision/OCR 结果）中。此时 `chunks` 须非空。
4. 未另行检测时，`title` 默认为文件名（不含扩展名）。

### 4.8 缓存与 Wiki 路径分离

**原则：** 抽取缓存只键控**内容**（`contentHash` + 抽取器版本），不键控 Vault 路径或 Wiki 实例。`NormalizedDocument` 是运行时将 `CachedExtract` 与路径上下文**绑定**后的完整契约。

```typescript
/**
 * 将全局缓存命中结果绑定到具体源文件。
 * 每次 extract/ingest 对每个 sourceId 调用一次。
 */
function bindExtractContext(
  cached: CachedExtract,
  ctx: { wikiId: WikiId; sourceId: SourceId; title?: string }
): NormalizedDocument;

/** `title` 解析优先级（高 → 低）：ctx.title → sourceId 文件名（不含扩展名）→ cached.title */
```

**典型流程：**

```
TFile @ raw/legal/contracts/report.pdf
  → contentHash = sha256(bytes)
  → cache hit? 读取 extract.json (CachedExtract)
  → bindExtractContext({ wikiId: "legal", sourceId: "raw/legal/contracts/report.pdf" })
  → NormalizedDocument（含 wikiId、sourceId，供摄取流水线消费）
```

**同一内容、不同路径：** `raw/legal/a.pdf` 与 `raw/product-rd/b.pdf` 若字节相同，共享同一份 `extract.json`；各自 `bindExtractContext` 产出不同 `wikiId` / `sourceId` 的 `NormalizedDocument`，摄取仍写入各自 `wiki/{wikiId}/`。

**写入缓存：** 仅在新抽取完成时 `put(contentHash, CachedExtract)`；`meta.json.referencedBy` 可在命中时追加 `sourceId`（去重、上限如 32 条），不参与失效判断。

**禁止：** 在 `extract.json` 或缓存键中包含 `wikiId`、`sourceId`；不得因 Wiki 切换而对同一 `contentHash` 重复解析。

---

## 5. Wiki 领域模型（NormalizedDocument 下游）

Wiki 摄取消费 `NormalizedDocument` 并产出 Wiki 页面。类型对齐 Karpathy LLM Wiki 模式，并增加**带定位器的引用 (locator-aware mentions)**。

### 5.1 源分析（LLM 输出契约）

```typescript
interface SourceAnalysis {
  wikiId: WikiId;
  sourceId: SourceId;
  sourceTitle: string;
  summary: string;
  entities: EntityInfo[];
  concepts: ConceptInfo[];
  contradictions: ContradictionInfo[];
  /** Vault 相对路径，如 "wiki/legal/entities/acme-corp"。 */
  relatedPages: string[];
  keyPoints: string[];
  createdPages: string[];
  updatedPages: string[];
}

/** 跨源或跨页的矛盾/不一致陈述。 */
interface ContradictionInfo {
  /** 矛盾主题，如 "2024 revenue figure"。 */
  topic: string;
  description: string;
  /** 各方依据，至少 2 条。 */
  claims: {
    sourceId: SourceId;
    quote: string;
    locator?: SourceLocator;
    chunkId?: string;
  }[];
  /** 相关 Wiki 页（Vault 相对路径）。 */
  relatedPages?: string[];
}

interface Mention {
  quote: string;
  locator: SourceLocator;
  chunkId?: string;
}

interface EntityInfo {
  name: string;
  type: EntityTag;
  aliases?: string[];
  summary: string;
  mentions: Mention[];
  relatedEntities?: string[];
  relatedConcepts?: string[];
}

interface ConceptInfo {
  name: string;
  type: ConceptTag;
  aliases?: string[];
  summary: string;
  mentions: Mention[];
  relatedConcepts: string[];
  relatedEntities?: string[];
}
```

`EntityTag` 与 `ConceptTag` 词汇表定义于 `schema/{wikiId}/config.md`（见 [5.1.1](#511-wiki-schema-配置-configmd)）。

#### 5.1.1 Wiki Schema 配置 (`config.md`)

每个 Wiki 在 `schema/{wikiId}/config.md` 维护结构词汇表与摄取偏好。格式为 **YAML frontmatter + 可选 Markdown 说明正文**（正文不参与机器解析）。

```yaml
---
schemaVersion: 1
wikiId: legal
entityTags:
  - person
  - organization
  - location
  - product
  - event
conceptTags:
  - process
  - policy
  - metric
  - technology
customEntityTags: []    # 用户扩展，与 entityTags 合并去重
customConceptTags: []
entityResolution:
  matchBy: ['exact-name', 'alias']   # v0 不支持模糊匹配
  onConflict: 'merge-to-existing'  # 见 §5.7
---
```

`SchemaManager` 在摄取前加载；`schema_violation` Lint 校验页 frontmatter 的 `type` 与标签是否落在词汇表内。`schemaVersion` 升级时通过 Lint 提示迁移，不自动删页。

#### 5.1.2 矛盾信息持久化 (`ContradictionInfo`)

`SourceAnalysis.contradictions` **不**创建独立 Wiki 页。持久化规则：

1. **源页：** 写入对应 `wiki/{wikiId}/sources/{slug}.md` 的 `## Contradictions` 区块（与 `## Mentions in Source` 并列）；每条含 `topic`、`description`、各方 `claims` 与定位器。
2. **相关实体/概念页：** 在正文末尾追加 `## Related Contradictions` 列表项，链接回源页锚点；`relatedPages` 中的页同理追加反向链接。
3. **合并：** 同 `topic` + 重叠 `claims`（相同 `sourceId` + `quote`）视为同一条，追加 `claims` 而非重复段落。
4. **索引：** 不参与 `catalog.json` 检索字段；Query 通过选中页的 `## Related Contradictions` 间接暴露。

### 5.2 Wiki 页面 frontmatter（最小集）

```yaml
---
type: entity | concept | source
wikiId: legal
created: 2026-06-18
updated: 2026-06-18
sources:
  - raw/legal/contracts/report-q1.pdf
tags: []
reviewed: false   # 为 true 时，正文合并策略见 §5.5
aliases: []
---
```

### 5.3 Wiki 页面引用格式

源章节中的提及使用脚注式行：

```markdown
## Mentions in Source

- "逐字引用" — [[wiki/legal/sources/report-q1|Q1 Report]] (pdf p.12)
- "单元格上下文" — [[wiki/product-rd/sources/sales-data|Sales Data]] (Sheet: Revenue, A1:D20)
```

`(pdf p.12)` 的渲染由 `SourceLocator` 派生，而非 LLM 自由文本。

### 5.4 Query 索引（最低可行）

Query 在**单个 `wikiId` 作用域**内检索，不跨 Wiki。v0 不引入独立向量数据库；索引为插件维护的**检索目录 + 两阶段选页**。

**存储位置：** `.enterpriseflow/index/{wikiId}/`

```
{wikiId}/
  catalog.json       # 页面级目录（检索第一阶段）
  catalog.meta.json  # { builtAt, pageCount, pluginVersion }
```

```typescript
interface QueryCatalog {
  wikiId: WikiId;
  builtAt: string;
  pages: QueryCatalogEntry[];
}

interface QueryCatalogEntry {
  /** Vault 相对路径，如 "wiki/legal/entities/acme-corp.md"。 */
  path: string;
  type: 'entity' | 'concept' | 'source';
  title: string;
  aliases: string[];
  /** 用于关键词匹配的摘要片段（summary 或正文前 N 字）。 */
  excerpt: string;
  updated: string;
  sources: SourceId[];
}

interface QueryOptions {
  maxPages?: number;       // 默认 5
  maxContextTokens?: number; // 默认 12000；超出时按相关度截断页内正文
  keywordCandidateLimit?: number; // 默认 20；进入 LLM 重排的候选数
}
```

**构建时机：** `ingest` / `ingestWiki` 完成后增量更新相关条目；`regenerateIndex(wikiId)` 全量重建。`wiki/{wikiId}/index.md` 仍为人类可读总览，**不参与**机器检索。

**检索流程（两阶段）：**

1. **关键词召回：** 在 `catalog.json` 上对 `title`、`aliases`、`excerpt` 做不区分大小写的子串 / 分词匹配（v0 不依赖 Obsidian 内置索引），取 top `keywordCandidateLimit` 条。
2. **LLM 重排：** 将用户问题与候选列表（仅 `path` + `title` + `excerpt`）送一次短上下文 LLM 调用，选出最多 `maxPages` 个 `path`。
3. **上下文组装：** 按相关度顺序加载完整 Wiki 页正文；累计 token 超过 `maxContextTokens` 时从低相关页开始截断或丢弃整页。最终 prompt 包含：问题、选中页全文、回答格式要求（须引用 `[[wiki/{wikiId}/...]]`）。

**Token 计数（v0）：** 使用 **字符启发式** `ceil(charCount / 4)`，与具体 LLM 分词器无关，保证离线可测。截断在页粒度执行（整页保留或整页丢弃），页内不拆分。后续版本可换用 provider 报告的实际 `usage` 回调，不改变 `QueryOptions` 字段。

**与 `WikiService.query` 的关系：** `query-engine.ts` 封装上述三步骤；工作流 `wiki.query` 节点直接委托，不重复实现。

**非目标（v0）：** 本地 embedding 文件、跨 Vault 全文索引、chunk 级向量检索。可在后续版本于 `index/{wikiId}/` 下增加 `embeddings.jsonl` 而不破坏 `catalog.json` 契约。

### 5.5 页面合并策略（MergePolicy）

摄取写入已有页时，按下列规则合并；`reviewed: true` 时**正文（frontmatter 分隔符以下）永不覆盖**。

```typescript
/** 单页摄取时的合并模式（节点/设置可覆盖，默认 merge）。 */
type MergePolicy = 'overwrite' | 'merge' | 'skip';

interface PageMergeRules {
  /** reviewed: true → 跳过正文重写；false 时按 MergePolicy。 */
  body: MergePolicy | 'skip-if-reviewed';
  /** frontmatter.sources：并集去重，始终执行。 */
  sources: 'union';
  /** frontmatter.aliases：并集去重。 */
  aliases: 'union';
  /** frontmatter.updated：取较晚时间戳。 */
  updated: 'max';
  /** `## Mentions in Source` 区块：merge=追加去重；overwrite=整段替换。 */
  mentionsSection: 'append' | 'replace';
  /** Summary 段落（源页顶部摘要）：merge 时仅当原摘要为空才写入。 */
  summary: 'fill-if-empty' | 'replace';
}

/** 默认规则（实现内置，无需用户配置）。 */
const DEFAULT_PAGE_MERGE_RULES: PageMergeRules = {
  body: 'skip-if-reviewed',
  sources: 'union',
  aliases: 'union',
  updated: 'max',
  mentionsSection: 'append',
  summary: 'fill-if-empty',
};
```

`IngestOptions.mergePolicy` **仅覆盖 `body` 字段**；`sources`、`aliases`、`updated`、`mentionsSection`、`summary` 始终按 `DEFAULT_PAGE_MERGE_RULES` 执行（`mergePolicy: 'skip'` 时仍更新 frontmatter 与 mentions，仅跳过正文重写）。

**`mergePolicy` × `reviewed` 矩阵（`body` 字段）：**

| `mergePolicy` | `reviewed: false` | `reviewed: true` |
|---------------|-------------------|------------------|
| `merge`（默认） | 按 `DEFAULT_PAGE_MERGE_RULES` 合并正文 | **跳过正文**；仍合并 mentions（append）、sources（union）等 |
| `overwrite` | 整段替换正文 | **仍跳过正文**（`reviewed` 优先于 `overwrite`） |
| `skip` | 不修改正文 | 不修改正文 |

`mentionsSection` 在 `mergePolicy: 'overwrite'` 时为 `replace`；`merge` / `skip` 时为 `append`。`summary` 在 `overwrite` 时为 `replace`；否则为 `fill-if-empty`。

`wikiId` 显式传入且与 `sourceId` 解析结果不一致时，**fail fast** 并返回错误。

### 5.6 Lint 报告（LintReport）

```typescript
type LintSeverity = 'error' | 'warning' | 'info';

type LintIssueCode =
  | 'duplicate_entity'      // 同名/别名冲突的实体页
  | 'orphan_page'         // 无入链、非 index 的 Wiki 页
  | 'dead_link'           // [[wikilink]] 目标不存在
  | 'alias_collision'     // 别名跨页冲突
  | 'missing_wiki_id'     // frontmatter 缺少或与路径不一致
  | 'schema_violation'    // 不符合 schema/{wikiId}/config.md
  | 'raw_without_source'  // raw 文件无对应 sources/ 页
  | 'source_without_raw'; // sources/ 页指向不存在的 raw 文件

interface LintIssue {
  code: LintIssueCode;
  severity: LintSeverity;
  message: string;
  pagePath?: string;
  relatedPaths?: string[];
  /** 是否可由 Lint 自动修复（如重命名建议、补 frontmatter）。 */
  fixable: boolean;
}

interface LintReport {
  wikiId: WikiId;
  startedAt: string;
  finishedAt: string;
  issues: LintIssue[];
  stats: {
    pagesScanned: number;
    rawFilesScanned: number;
    bySeverity: Record<LintSeverity, number>;
  };
}

interface LintOptions {
  /** 仅报告或尝试自动修复 fixable 项。 */
  autoFix?: boolean;
}
```

Lint 结果可写入 `wiki/{wikiId}/log.md`（追加摘要行）并通过 `lint:done` 事件发布（见 [§11](#11-事件跨模块集成)）。

### 5.7 实体解析（Entity Resolution）

摄取时 `PageFactory` 将 `EntityInfo` / `ConceptInfo` 映射到已有页或新建页，规则由 `schema/{wikiId}/config.md` 的 `entityResolution` 驱动（v0 默认 `onConflict: 'merge-to-existing'`）。

**匹配顺序（`wikiId` 作用域内）：**

1. **精确名：** `entities/{slug(name)}.md` 或 `concepts/{slug(name)}.md` 已存在 → 合并到该页。
2. **别名：** frontmatter `aliases` 与 `EntityInfo.aliases` 交集 → 合并到别名所属页。
3. **无匹配：** 创建新页，`slug` = 小写、空格转连字符、去非法字符；冲突时追加 `-2`、`-3`…

**`onConflict: 'merge-to-existing'` 行为：** 合并 `mentions`（append 去重）、`sources`（union）、`aliases`（union）、`summary`（`fill-if-empty`）；正文按 §5.5。摄取阶段**不**自动合并两个均已存在的同名不同 slug 页 — 留给 Lint `duplicate_entity` + 用户确认。

**禁止：** 跨 `wikiId` 合并；工作流节点不得绕过 `PageFactory` 直接写实体路径。

### 5.8 摄取与问答报告类型

```typescript
interface IngestReport {
  wikiId: WikiId;
  sourceId?: SourceId;           // ingestWiki 时省略
  status: 'completed' | 'partial' | 'failed' | 'cancelled';
  createdPages: string[];        // Vault 相对路径
  updatedPages: string[];
  skippedPages: string[];        // mergePolicy: skip 或 reviewed 跳过
  errors: IngestError[];
  durationMs: number;
  startedAt: string;
  finishedAt?: string;
}

interface IngestError {
  sourceId?: SourceId;
  pagePath?: string;
  code: 'extract_failed' | 'llm_failed' | 'write_failed' | 'wiki_mismatch' | 'cancelled';
  message: string;
}

interface IngestWikiOptions extends IngestOptions {
  /** glob 相对于 raw/{wikiId}/；默认匹配该 Wiki 下全部文件 */
  glob?: string;
  /** 跳过 contentHash 未变且已有 sources 页的文件；默认 true */
  skipUnchanged?: boolean;
  /** 并行摄取文件数上限；默认取 settings.pageGenerationConcurrency */
  concurrency?: number;
}

/** query() 流式输出块。 */
type QueryChunk =
  | { kind: 'text'; delta: string }
  | { kind: 'citation'; path: string; locator?: string }
  | { kind: 'done'; answer: string; citedPaths: string[] }
  | { kind: 'error'; message: string };
```

---

## 6. 模块边界

### 6.1 共享核心 (`src/core/`)

**职责：** 基础设施层，不感知 Wiki prompt 或工作流图。

| 子模块 | 导出（概念） | 依赖 |
|--------|-------------|------|
| `llm/` | `LLMClient`、流式、重试、取消 | settings |
| `jobs/` | `JobQueue`、`JobHandle`、进度、取消 | events |
| `vault/` | `VaultAdapter`、路径辅助、读写 | obsidian API |
| `cache/` | 按 `ContentHash` 读写 `CachedExtract`（§4.6–§4.8） | vault |
| `backup/` | Vault 快照打包、S3/GitHub 传输（§19） | vault, jobs, settings |
| `events/` | `EventBus`（类型化发布/订阅） | — |
| `config/` | `PluginSettings`、默认值、迁移 | — |
| `log/` | 结构化调试日志 | — |

**对外接口：**

```typescript
interface CoreServices {
  llm: LLMService;
  jobs: JobService;
  vault: VaultAdapter;
  cache: ExtractCache;
  backup: BackupService;
  events: EventBus;
  settings: PluginSettings;
}
```

### 6.2 文档 Wiki (`src/wiki/`)

**职责：** 抽取 → 分析 → 写入 Wiki 页 → 问答 → Lint。

| 子模块 | 职责 | 禁止 |
|--------|------|------|
| `extractors/` | 各格式 `DocumentExtractor` → `NormalizedDocument` | import 工作流 UI |
| `normalize/` | 分块、语言检测、后处理 | 调用 LLM 做实体抽取 |
| `engine/` | `WikiEngine` 编排 | 渲染 React 工作流画布 |
| `engine/source-analyzer.ts` | 从分块分批 LLM 抽取 | 解析 PDF 字节 |
| `engine/page-factory.ts` | 创建/合并实体与概念页 | 执行工作流图 |
| `engine/query-engine.ts` | RAG 式 Wiki 问答 | — |
| `engine/lint/` | 重复、死链、孤儿页、别名 | — |
| `schema/` | `SchemaManager`（按 `wikiId` 加载 `schema/{wikiId}/`） | — |
| `ui/` | 摄取弹窗、问答弹窗、Lint 报告 | — |

**对外接口（供工作流模块调用）：**

```typescript
interface WikiService {
  listWikis(): Promise<WikiInstance[]>;

  extract(file: TFile, options?: ExtractOptions): Promise<NormalizedDocument>;
  ingest(document: NormalizedDocument, options?: IngestOptions): Promise<IngestReport>;
  ingestFile(file: TFile, options?: IngestOptions): Promise<IngestReport>;
  ingestWiki(wikiId: WikiId, options?: IngestWikiOptions): Promise<IngestReport>;

  query(wikiId: WikiId, question: string, options?: QueryOptions): AsyncIterable<QueryChunk>;
  lint(wikiId: WikiId, options?: LintOptions): Promise<LintReport>;
  regenerateIndex(wikiId: WikiId): Promise<void>;
}

interface IngestOptions {
  /** 默认由 sourceId 解析；显式传入时须与解析结果一致，否则报错。 */
  wikiId?: WikiId;
  mergePolicy?: MergePolicy;
}
```

### 6.3 工作流 (`src/workflow/`)

**职责：** 定义、编辑并执行 DAG；支持**子工作流嵌套**（`workflow.subworkflow` 节点）。节点调用 Core 与 Wiki 服务。

| 子模块 | 职责 | 禁止 |
|--------|------|------|
| `schema/` | `WorkflowDefinition`、节点/边类型、嵌套校验（环检测） | 解析 PDF |
| `registry/` | `NodeType` 定义、输入/输出 JSON Schema | 直接写 Wiki 页 |
| `runtime/` | 拓扑执行、变量、取消、**子工作流调度** | 嵌入 Obsidian 视图 |
| `runtime/context.ts` | `WorkflowContext`、变量作用域、**调用栈** | — |
| `runtime/nested-runner.ts` | 子工作流加载、入参/出参映射、深度限制 | — |
| `ui/` | React Flow 画布、节点检查器、**嵌套运行树**日志 | 实现抽取器 |

**对外接口：**

```typescript
interface WorkflowService {
  load(definitionPath: string): Promise<WorkflowDefinition>;
  /** 含 DAG 校验、子工作流引用解析、静态环检测。 */
  validate(def: WorkflowDefinition, options?: ValidateOptions): ValidationResult;
  run(def: WorkflowDefinition, inputs?: Record<string, unknown>, options?: RunOptions): Promise<RunReport>;
  cancel(runId: string): void;  // 取消根运行及其全部子运行
}

interface ValidateOptions {
  /** 预加载并展开子工作流引用图，检测 A→B→A 循环。 */
  resolveSubworkflows?: boolean;
}

interface RunOptions {
  parentRunId?: string;
  depth?: number;              // 根运行为 0
  inheritedVariables?: Record<string, unknown>;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

interface ValidationIssue {
  code:
    | 'cycle_detected'
    | 'missing_node'
    | 'dangling_edge'
    | 'unknown_node_type'
    | 'subworkflow_not_found'
    | 'duplicate_workflow_id'
    | 'port_mismatch'
    | 'schema_invalid';
  message: string;
  nodeId?: string;
  workflowRef?: string;
}
```

### 6.4 UI 外壳 (`src/ui/`、`src/main.ts`)

- 插件生命周期、命令、功能区图标、设置页（含备份提供商单选与凭据表单）。
- 装配 `CoreServices`、`WikiService`、`WorkflowService`。
- **跨模块编排（唯一允许的「订阅方」）：** 订阅 `restore:done` 后，根据 `RestoreReport` 中受影响路径解析 `wikiId` 列表，向用户提示是否对相应 Wiki 执行 `regenerateIndex`（不自动 ingest）。Wiki / Workflow 模块本身不订阅彼此事件。
- 命令与弹窗在需要 `wikiId` 时：优先使用节点/参数显式值；UI 交互可用 `activeWikiId`；二者皆无则**阻断并提示选择 Wiki**（见 [§12](#12-设置概要)）。
- 除上述委托与编排外不含业务逻辑。

---

## 7. 抽取器插件契约

```typescript
interface DocumentExtractor {
  /** 与 ExtractMetadata.extractorId 一致的唯一 id。 */
  readonly id: string;
  readonly version: string;

  /** 不含点的小写扩展名。 */
  readonly extensions: string[];

  /** 可选 MIME 类型，用于路由。 */
  readonly mimeTypes?: string[];

  supports(file: TFile): boolean;

  extract(
    file: TFile,
    ctx: ExtractContext
  ): Promise<NormalizedDocument>;  // 内部：抽取或读缓存 → bindExtractContext
}

interface ExtractContext {
  services: CoreServices;
  signal: AbortSignal;
  options: ExtractOptions;
}

interface ExtractOptions {
  ocr: 'off' | 'auto' | 'force';
  visionModel?: string;
  maxPages?: number;       // PDF 安全上限
  sheetFilter?: string[];  // XLSX
}
```

**注册：** `src/wiki/extractors/registry.ts` 中的 `ExtractorRegistry`。新格式 = 新类 + 注册；无需修改 `WikiEngine` 摄取循环。

### 7.1 内置抽取器（计划）

| id | 输入 | 库 / 方案 |
|----|------|----------|
| `pdf-text` | `.pdf`（文字层） | pdf.js / pdf-parse |
| `pdf-vision` | `.pdf`（扫描件） | 按页 LLM vision |
| `docx-mammoth` | `.docx` | mammoth → markdown |
| `xlsx-sheetjs` | `.xlsx`、`.xls` | SheetJS → 按 sheet 分块 |
| `image-vision` | `.png`、`.jpg`、`.webp` | LLM vision 或 Tesseract |
| `text-plain` | `.txt`、`.md`、`.csv` | 直接读取 |

### 7.2 PDF 抽取器路由

| 条件 | 选用抽取器 |
|------|-----------|
| 文字层非空 | `pdf-text` |
| 文字层为空 / `empty_text` 且 `defaultOcr: auto` \| `force` | `pdf-vision` |
| 文字层为空且 `defaultOcr: off` | `pdf-text` 结束，附带 `empty_text` 警告；**不**自动调用 vision |

路由在 `ExtractorRegistry` 内实现；工作流 `doc.extract` 可通过 `ExtractOptions.ocr` 覆盖单次行为。

---

## 8. 工作流定义契约

### 8.1 文件格式

- 路径：`workflows/{name}.workflow.json`
- `schemaVersion: 1`

```typescript
interface WorkflowDefinition {
  schemaVersion: 1;
  /** Vault 内全局唯一；validate() 扫描 workflowsFolder 下全部定义，冲突报错 duplicate_workflow_id。 */
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, unknown>;  // 默认变量值

  /** 作为子工作流被调用时的入参/出参契约（可选；未声明时按运行时映射透传）。 */
  inputs?: WorkflowPortSchema;
  outputs?: WorkflowPortSchema;
}

/** 端口名 → 类型描述，供嵌套调用校验与 UI 提示。 */
type WorkflowPortSchema = Record<string, WorkflowPort>;

interface WorkflowPort {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'any';
  description?: string;
  required?: boolean;
}

interface WorkflowNode {
  id: string;
  type: string;           // 注册表键，如 "wiki.ingest"
  position: { x: number; y: number };  // 仅 UI
  data: Record<string, unknown>;        // 节点配置
}

interface WorkflowEdge {
  id: string;
  from: string;           // 节点 id
  to: string;
  fromPort?: string;      // 分支输出
  toPort?: string;
}
```

### 8.2 嵌套工作流（子工作流）

工作流**可以、且鼓励**通过 `workflow.subworkflow` 节点调用另一份工作流定义，形成组合与复用。

**语义：**

| 项 | 规则 |
|----|------|
| **引用方式** | `data.workflowRef` 为 **Vault 相对路径**（推荐，如 `workflows/ingest-single-file.workflow.json`）**或** `WorkflowDefinition.id`。路径优先；按 id 解析时须唯一匹配，否则 `validate` 报 `subworkflow_not_found` / `duplicate_workflow_id` |
| **入参** | 父节点 `data.inputMapping` 将父上下文变量映射到子工作流 `inputs` |
| **出参** | 子工作流 `outputs` 映射回父节点输出端口，供后续节点使用 |
| **作用域** | 子运行拥有**独立变量表**；默认不污染父作用域（仅通过 mapping 显式传出） |
| **继承** | 可继承父运行的 `wikiId`、`signal`（取消）、`rootRunId` |
| **深度** | 根运行 `depth=0`；每嵌套一层 +1；超过 `maxWorkflowNestingDepth` 则拒绝执行 |
| **环检测** | `validate()` 静态展开子工作流引用图，禁止直接/间接循环（A→B→A） |
| **取消** | 取消父 `runId` 时，递归取消所有进行中的子 `runId` |
| **日志** | `.enterpriseflow/runs/{rootRunId}/` 存树形结构；UI 展示嵌套运行树 |

**嵌套示例：**

```
ingest-and-summarize.workflow.json
  trigger.manual
    → file.pick
    → workflow.subworkflow  ──调用──▶  ingest-single-file.workflow.json
    │                                      trigger.manual (ignored in child)
    │                                      → doc.extract
    │                                      → wiki.ingest
    → llm.chat（使用子工作流输出的 summary）
    → output.notice
```

**子工作流节点配置：**

```typescript
// type: workflow.subworkflow
interface SubworkflowNodeData {
  /** vault 相对路径，如 "workflows/ingest-single-file.workflow.json"。 */
  workflowRef: string;
  /** 父变量名或 {{模板}} → 子工作流 input 端口名。模板语法见 §8.5。 */
  inputMapping: Record<string, string>;
  /** 子 output 端口名 → 父节点输出字段名（可选，默认同名）。 */
  outputMapping?: Record<string, string>;
  /** 是否在子运行失败时中止父运行；默认 true。 */
  failParentOnError?: boolean;
}
```

**运行时上下文：**

```typescript
interface WorkflowContext {
  runId: string;
  rootRunId: string;
  parentRunId?: string;
  depth: number;
  callStack: string[];     // workflow id 链，如 ["ingest-batch", "ingest-single-file"]
  variables: Map<string, unknown>;
  services: { llm; wiki; vault; jobs; backup: BackupService; workflow: WorkflowService };
  signal: AbortSignal;
  wikiId?: WikiId;
}

interface RunReport {
  runId: string;
  rootRunId: string;
  parentRunId?: string;
  depth: number;
  workflowId: string;
  status: 'completed' | 'failed' | 'cancelled';
  childRuns?: RunReport[];   // 嵌套子运行摘要（树形）
  outputs?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}
```

**与 Wiki 多实例的关系：** 子工作流**不自动切换** `wikiId`；由父流程通过 `inputMapping` 传入，或在子工作流内部由 `file.pick` / 节点配置显式指定。禁止子工作流隐式跨 `wikiId` 写入。

### 8.3 节点处理器契约

```typescript
interface NodeTypeDefinition {
  type: string;
  label: string;
  inputs: JsonSchema;
  outputs: JsonSchema;
  execute(
    ctx: WorkflowContext,
    config: Record<string, unknown>,
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}
```

### 8.4 标准节点类型（v0）

| type | 模块 | 调用 |
|------|------|------|
| `trigger.manual` | workflow | — |
| `trigger.file-added` | workflow | events（监听 `raw/{wikiId}/**`；见 [§12](#12-设置概要) 防抖） |
| `file.pick` | workflow | vault（限定 `raw/{wikiId}/`） |
| `doc.extract` | workflow | `WikiService.extract` |
| `wiki.ingest` | workflow | `WikiService.ingest`（需 `wikiId`） |
| `wiki.query` | workflow | `WikiService.query`（需 `wikiId`） |
| `llm.chat` | workflow | `CoreServices.llm` |
| `branch.if` | workflow | — |
| `workflow.subworkflow` | workflow | `WorkflowService.run`（嵌套子工作流） |
| `vault.backup.push` | workflow | `BackupService.push` |
| `vault.backup.pull` | workflow | `BackupService.pull` |
| `output.notice` | workflow | obsidian Notice |

工作流节点**不得**重复 Wiki 逻辑；须委托给 `WikiService`。备份节点须委托给 `BackupService`。子工作流节点**不得**内联复制子图，须通过 `workflowRef` 引用独立定义文件。

**`trigger.file-added` 语义：** 监听 Vault `create` 事件，路径须落在 `raw/{wikiId}/**` 且 `wikiId` 可解析。经 `fileAddedDebounceSeconds` 防抖后发布 `file:added`。所有 `data.wikiId` 匹配（或省略以接受任意 Wiki）且已启用的工作流**各启动一次**根运行（R14）；同一工作流不会对同一 `path` 重复触发（运行期内去重）。批量导入时推荐单入口工作流 + `workflow.subworkflow`。

### 8.5 表达式与变量替换（v0）

v0 **不实现**通用表达式语言（无算术、无函数调用、无三元运算、无管道）。节点配置与工作流 mapping 仅支持：

1. **字面量：** JSON 原值（字符串、数字、布尔、对象）。
2. **变量引用：** `{{name}}`，从 `WorkflowContext.variables` 读取。
3. **嵌套路径：** `{{name.foo.bar}}`，仅点分属性访问；中间节点须为 object，否则解析失败。
4. **输入端口绑定：** 节点 `execute` 的 `inputs` 参数由运行时解析边连接；**不**在 JSON 配置里写 `{{input.x}}`。

```typescript
/** v0 模板：整段字符串为单一引用，或纯字面量。不支持拼接模板。 */
type WorkflowTemplate = string;

// ✅ 合法
// inputMapping: { "file": "{{pickedFile}}" }
// data.message: "{{summary}}"

// ❌ v0 禁止
// "{{prefix}}-{{id}}"
// "{{count + 1}}"
// "{{#if}}...{{/if}}"
```

**`branch.if` 条件（结构化，非字符串表达式）：**

```typescript
interface BranchIfNodeData {
  /** 变量模板或字面量，如 "{{status}}"。 */
  left: WorkflowTemplate;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'empty';
  /** exists / empty 时省略。 */
  right?: string | number | boolean;
}
```

运行时先将 `left`（及需要时的 `right`）按模板规则解析，再比较。比较失败或类型不兼容时走 **false** 分支。

**后续版本：** 若需字符串拼接，可引入受限的 `{{concat a b}}` 白名单函数；v0 不预留通用 mini-DSL 扩展点，避免实现膨胀。

---

## 9. 数据流

### 9.1 从文件摄取（模块 A）

```
raw/legal/contracts/foo.pdf
    → resolveWikiId → wikiId = "legal"
    → ExtractorRegistry.route
    → CachedExtract（缓存命中则跳过解析）
    → bindExtractContext → NormalizedDocument（含 wikiId）
    → ExtractCache.put（仅新抽取；键 = contentHash）
    → SourceAnalyzer（LLM，按 chunk/批次；上下文限定 wiki/legal）
    → SourceAnalysis
    → PageFactory（实体、概念、源页）
    → wiki/legal/** + index.md + log.md
```

### 9.2 经工作流摄取（含嵌套，模块 B → A）

```
trigger → file.pick → workflow.subworkflow(ingest-single-file) → llm.chat → output.notice
                              │
                              ▼ 子运行 depth=1
                    doc.extract → wiki.ingest
                              │
                              ▼ 子 outputs 回传父节点
                         IngestReport / summary
```

### 9.3 问答 (Query)

```
用户问题 + wikiId
    → 读取 .enterpriseflow/index/{wikiId}/catalog.json
    → 关键词召回 top-N 候选
    → LLM 重排 → 选出 ≤ maxPages 页
    → 加载页正文，按 maxContextTokens 组装上下文
    → LLM 流式输出
    → 带 [[wiki/{wikiId}/...]] 与可选定位器引用的回答
```

详见 §5.4。

### 9.4 Vault 远程备份

```
用户触发 push / 定时任务
    → SnapshotBuilder 扫描 Vault → snapshot.zip + manifest.json
    → BackupProvider（S3 或 GitHub，由 settings.backup.provider 决定）
    → 远端写入；发布 backup:done

用户触发 pull
    → BackupProvider 列出/下载指定 snapshot
    → 解压至 staging；dryRun 或用户确认后 merge/replace 写入 Vault
    → 发布 restore:done
```

详见 §19。

---

## 10. 任务模型

所有长时任务经 `JobQueue` 调度：

| 任务类型 | 归属 | 可取消 |
|----------|------|--------|
| `extract` | wiki | 是 |
| `ingest` | wiki | 是 |
| `lint` | wiki | 是 |
| `query` | wiki | 是 |
| `workflow-run` | workflow | 是（含子运行） |
| `backup-push` | core | 是 |
| `backup-pull` | core | 是 |

```typescript
interface Job {
  id: string;
  kind: JobKind;
  wikiId?: WikiId;        // extract/ingest/lint/query 必填；workflow-run 可选
  rootRunId?: string;     // workflow-run：嵌套树归属同一根运行
  parentJobId?: string;   // workflow-run：子工作流任务指向父任务
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: { message: string; current?: number; total?: number };
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}
```

同一 `wikiId` + `sourceId` 同时仅允许一个 **ingest** 任务（去重）。同一 `contentHash` 同时仅允许一个 **extract** 任务（去重；并发请求共享同一 Promise / JobHandle）。哈希未变时可借抽取缓存跳过重新解析。

`maxConcurrentWorkflowRuns` 限制**根** `workflow-run` 并行数；子运行计入父任务，不单独占用该配额。

---

## 11. 事件（跨模块集成）

| 事件 | 载荷 | 典型订阅方 |
|------|------|-----------|
| `file:added` | `{ path, wikiId: WikiId \| null }` | 工作流触发器 |
| `extract:done` | `{ wikiId, sourceId, contentHash }` | 指标、工作流 |
| `ingest:done` | `{ wikiId, report: IngestReport }` | 工作流、通知 |
| `lint:done` | `{ wikiId, report: LintReport }` | UI（写 log 摘要） |
| `workflow:done` | `RunReport`（含 `childRuns` 树） | 通知 |
| `workflow:child-done` | `{ rootRunId, parentRunId, report: RunReport }` | 父运行聚合 |
| `backup:done` | `{ report: BackupReport }` | 通知、工作流 |
| `backup:failed` | `{ report: BackupReport }` | 通知 |
| `restore:done` | `{ report: RestoreReport }` | **UI 外壳**（提示 `regenerateIndex`）、通知、工作流 |
| `restore:failed` | `{ report: RestoreReport }` | 通知 |

**`file:added` 的 `wikiId`：** `resolveWikiId(path)` 成功则为对应 WikiId；否则为 `null`（文件不在 `raw/{wikiId}/` 下、或违规放在 `raw/` 根目录）。`null` 时工作流触发器**不**启动（记录 debug 日志）。

**订阅规则：** Wiki 与 Workflow **发布**领域事件；彼此**不**互订（避免循环依赖）。跨模块用户可见副作用（如恢复后索引提示）由 **UI 外壳**（[§6.4](#64-ui-外壳-srcuimaints)）统一订阅并委托服务。

---

## 12. 设置（概要）

```typescript
interface PluginSettings {
  // LLM
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  llmReady: boolean;

  // 路径
  rawFolder: string;         // 默认: raw
  wikiRoot: string;          // 默认: wiki（实际 wiki 路径 = wikiRoot/wikiId）
  schemaRoot: string;        // 默认: schema（实际 schema 路径 = schemaRoot/wikiId）
  workflowsFolder: string;   // 默认: workflows

  // 当前活动 Wiki（仅 UI 默认上下文；不替代节点/命令中的显式 wikiId）
  activeWikiId?: WikiId;

  // Wiki
  language: string;
  extractionGranularity: 'minimal' | 'coarse' | 'standard' | 'fine' | 'custom';
  pageGenerationConcurrency: number;

  // 抽取
  defaultOcr: 'off' | 'auto' | 'force';
  extractCacheEnabled: boolean;

  // 工作流
  maxConcurrentWorkflowRuns: number;
  maxWorkflowNestingDepth: number;  // 默认: 8；嵌套子工作流最大深度
  workflowRunRetentionDays: number;   // 默认: 30
  workflowRunRetentionCount: number;  // 默认: 100；按 rootRunId 全局计

  // 工作流触发
  /** trigger.file-added 防抖秒数；同一 path 在窗口内仅派发一次 file:added。默认 5。 */
  fileAddedDebounceSeconds: number;

  // 远程备份（S3 与 GitHub 二选一，见 [§19](#19-vault-远程备份与恢复)）
  backup: BackupSettings;
}
```

**`activeWikiId` 语义：**

| 场景 | 行为 |
|------|------|
| 已设置且 `raw/{activeWikiId}/` 存在 | UI 命令（Query、摄取当前 Wiki）默认使用该 Wiki |
| 未设置或目录已删除 | UI 显示 Wiki 选择器；**阻断**依赖 Wiki 的命令直至用户选择 |
| 工作流 `wiki.*` 节点 | **`wikiId` 必填**（节点 `data.wikiId` 或 `{{var}}`）；不得隐式回落到 `activeWikiId` |
| `listWikis()` 为空 | 设置页提示创建 `raw/{name}/` 子目录；Wiki 相关功能不可用 |

存储于 Obsidian `data.json`，版本化迁移位于 `src/core/config/migrations.ts`。

---

## 13. 代码布局

```
src/
  main.ts                 # 插件入口
  core/                   # §6.1 — 不 import wiki/workflow
    backup/
      snapshot.ts         # 打包 / 解包
      providers/
        s3-provider.ts
        github-provider.ts
  wiki/                   # §6.2 — 可 import core
    instance-resolver.ts  # resolveWikiId、listWikiInstances
    extractors/
    normalize/
    engine/
    schema/
    ui/
  workflow/               # §6.3 — 可 import core + wiki 接口
    schema/
    registry/
    runtime/
      nested-runner.ts
    ui/
  shared/                 # 跨模块共享类型（本文档契约）
    types/
      normalized-document.ts
      cached-extract.ts
      wiki.ts
      wiki-instance.ts
      wiki-schema.ts
      query-catalog.ts
      ingest-report.ts
      query-chunk.ts
      backup.ts
      workflow.ts
      validation.ts
```

**Import 约束（由 ESLint 强制执行）：**

- `core/**` → 不得 import `wiki/**` 或 `workflow/**`
- `wiki/**` → 不得 import `workflow/**`
- `workflow/**` → 仅可 import `wiki` 服务门面（`wiki/service.ts`），不得 import 引擎内部文件

---

## 14. 测试策略

| 层级 | 重点 |
|------|------|
| `shared/types` | JSON schema 往返、定位器格式化、`bindExtractContext`（含 **title 优先级**：ctx.title → sourceId 文件名 → cached.title） |
| `extractors` | fixture → 黄金 `CachedExtract`；绑定后 `NormalizedDocument` |
| `wiki/engine` | mock LLM → 页面输出快照；`MergePolicy` × `reviewed` 矩阵（§5.5）；实体解析 slug 冲突 |
| `wiki/query` | `catalog.json` 构建、关键词召回、mock LLM 重排 |
| `workflow/runtime` | DAG 顺序、分支、取消、变量传递、**嵌套深度与环检测**、`{{var}}` 模板 |
| `core/backup` | 快照打包/解包；manifest `files[]` 比较；mock S3/GitHub provider；恢复 merge 边界 |
| integration | 小 fixture vault 上 extract → ingest → query |

抽取器应尽可能在**无 Obsidian 运行时**环境下做基于 fixture 的测试。

---

## 15. 版本与迁移

| 产物 | 版本字段 | 迁移方式 |
|------|----------|----------|
| `CachedExtract` / `NormalizedDocument` | `schemaVersion` | 升级 → 失效抽取缓存 |
| `QueryCatalog` | `builtAt`（整文件重建） | `regenerateIndex` |
| `WorkflowDefinition` | `schemaVersion` | 迁移脚本或带消息拒绝 |
| `PluginSettings` | data.json 中 `settingsVersion` | `onload` 迁移 |
| `BackupManifest` | `schemaVersion` | 旧快照只读；新 push 使用新版本 |
| Wiki 页面 | frontmatter `type` | Lint 修复，非自动破坏 |

---

## 16. 安全与隐私

1. 无插件自有后端；网络连接用户配置的 **LLM 端点**与**所选备份目标**（S3 或 GitHub）。
2. v0.x 工作流节点不执行任意代码。
3. `raw/` 文件仅在抽取（vision/OCR）与摄取（分析）时发送至 LLM — 由用户或工作流触发；作用域为对应 `wikiId`。
4. API 密钥、S3 凭据、GitHub PAT 仅存于 Obsidian `data.json`；UI 中密钥字段掩码显示。
5. 备份快照含 Vault 全文（`scope: full` 时含用户普通笔记与 `.obsidian` 配置）。`scope: enterpriseflow` 仍含 `raw/`、`wiki/` 全文。用户须自行评估远端存储权限与加密（S3 SSE、私有仓库等）。
6. `.enterpriseflow/extracts/` 按 `contentHash` 存**全文抽取结果**，默认**不**纳入备份（`includeExtractCache: false`）；若用户开启，远端将包含所有曾解析文件的文本。同一字节文件跨 Wiki 共享缓存 — 用户应知悉磁盘与备份中的去重语义。
7. `backup-pull` 的 `replace` 模式可覆盖本地文件，须经 UI 二次确认；工作流节点仅允许 `merge`，或 `data.confirmed: true` 且由手动触发器发起。

---

## 17. 分阶段交付路线图

> 可执行任务分解、验收标准与 Sprint 建议见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。

| 阶段 | 交付物 | 验证点 |
|------|--------|--------|
| 0 | Core + 空 Wiki/Workflow 门面 | 模块边界 |
| 1 | 一种抽取器 + 摄取 + 基础页面 | `NormalizedDocument` → wiki |
| 2 | 全部抽取器 + 抽取缓存 | 目录约定 |
| 3 | Query + Lint | Wiki 模块完成 |
| 4 | 工作流运行时（JSON + **子工作流嵌套**） | 节点注册表、环检测 |
| 5 | 工作流画布 UI | 全栈贯通 |
| 6 | Vault 远程备份（S3 **或** GitHub） | 快照上传/下载、恢复 merge |

---

## 18. 待决与已决事项

### 18.1 已决（v0.6）

| ID | 问题 | 决议 |
|----|------|------|
| R1 | 每个 Vault 是否支持多个 Wiki？ | 是；`raw/` **一级**子目录各对应一套 Wiki（[§3.1](#31-多-wiki-实例模型)），不支持更深分级 |
| R2 | 抽取结果存 JSON 还是仅 markdown？ | `extract.json`（`CachedExtract`）+ `full.md` sidecar（[§4.6](#46-磁盘缓存结构)） |
| R3 | 密码保护 PDF | 抽取失败，返回 `password_protected` 警告（[§4.5](#45-警告)） |
| R4 | 抽取缓存与 `wikiId` | 缓存 Wiki 无关；运行时 `bindExtractContext` 注入路径字段（[§4.8](#48-缓存与-wiki-路径分离)） |
| R5 | `raw/` 根目录误放文件 | 扫描告警，建议移入 `raw/{wikiId}/`（[§3.1](#31-多-wiki-实例模型)） |
| R6 | 子工作流最大嵌套深度 | 默认 8，设置项 `maxWorkflowNestingDepth`（[§8.2](#82-嵌套工作流子工作流)、[§12](#12-设置概要)） |
| R7 | Query 索引形态（v0） | 每 Wiki `catalog.json` + 关键词召回 + LLM 重排（[§5.4](#54-query-索引最低可行)） |
| R8 | 工作流 v0 表达式 | 仅 `{{var}}` / `{{var.path}}` 整段替换；`branch.if` 用结构化条件（[§8.5](#85-表达式与变量替换v0)） |
| R9 | 远程备份提供商 | **互斥：** `backup.provider` 为 `none` \| `s3` \| `github` 之一（[§19](#19-vault-远程备份与恢复)） |
| R10 | 备份载体格式 | 统一 `snapshot.zip` + `manifest.json`；S3 与 GitHub 传输同一快照工件 |
| R11 | 工作流运行记录保留策略 | **OR 语义：** 保留满足**任一**条件的根运行 — (1) 创建于 `workflowRunRetentionDays`（默认 30）天内；(2) 属于全局最近 `workflowRunRetentionCount`（默认 100）条根运行。清理时删除**同时不满足**两者的记录 |
| R12 | 远程备份保留份数 | `backup.retentionCount` 默认 **10**；push 成功后删除更早快照 |
| R13 | PDF 文字层 vs vision 路由 | `defaultOcr: auto` 时，无文字层或 `empty_text` 回退 `pdf-vision`；`defaultOcr: off` 时**不**自动 vision，仅保留 `empty_text` 警告；`force` 始终 vision |
| R14 | `trigger.file-added` 多工作流 | 防抖后，所有匹配 `wikiId` 的已启用工作流**各触发一次**独立运行；推荐用单一编排工作流 + `workflow.subworkflow` 避免风暴 |
| R15 | GitHub 大文件 | 未压缩 zip > **50 MB** UI 警告；> **75 MB**（约 Contents API 100 MB base64 上限）**阻断 push**，提示改用 S3 |
| R16 | 恢复后索引 | **UI 外壳**订阅 `restore:done` 提示 `regenerateIndex`；Wiki 模块不订阅（[§6.4](#64-ui-外壳-srcuimaints)、[§11](#11-事件跨模块集成)） |
| R17 | 实体同名冲突 | 摄取时 `merge-to-existing`（[§5.7](#57-实体解析entity-resolution)）；已存在 duplicate 由 Lint 报告 |
| R18 | restore `merge` 新旧判定 | 以 manifest `files[].modifiedAt` + `contentHash` 为准，**不**依赖 OS mtime（[§19.5](#195-backupservice-api)） |

### 18.2 待决

| ID | 问题 | 当前默认 |
|----|------|----------|
| D1 | Query 流式引用展示格式 | `QueryChunk` `citation` 事件在正文中插入 `[[path]]` 占位；UI 一次性渲染 |
| D2 | `ingestWiki` 失败文件是否继续 | 默认 `partial`：单文件失败记入 `IngestReport.errors`，继续其余文件 |

---

## 19. Vault 远程备份与恢复

将当前 Vault（或可选子集）打成**版本化快照**，上传至用户配置的 **S3 兼容存储**或 **GitHub 仓库**；亦可从远端**列出并下载**快照恢复本地。两种提供商**互斥配置**，通过 `settings.backup.provider` 选择。

### 19.1 提供商互斥

```typescript
type BackupProvider = 'none' | 's3' | 'github';

/**  discriminated union：同一 settings 对象内仅一种 provider 生效。 */
type BackupSettings =
  | { provider: 'none' }
  | S3BackupSettings
  | GitHubBackupSettings;

interface BackupSettingsCommon {
  /** 备份范围，见 §19.2。 */
  scope: BackupScope;
  /** 是否包含 `.enterpriseflow/extracts/`；默认 false。 */
  includeExtractCache: boolean;
  /** 额外排除 glob，合并默认排除表。 */
  excludePatterns: string[];
  /** 定时备份（仅 push）。 */
  scheduleEnabled: boolean;
  /** 间隔小时数；默认 24。v0 不使用 cron 表达式。 */
  scheduleIntervalHours: number;
  /** 远端保留快照份数；默认 10（R12）。 */
  retentionCount: number;
}

interface S3BackupSettings extends BackupSettingsCommon {
  provider: 's3';
  endpoint: string;          // 如 https://s3.amazonaws.com 或 MinIO URL
  region: string;
  bucket: string;
  prefix: string;            // 对象键前缀，如 "obsidian/acme-vault"
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO 等路径风格端点；默认 false。 */
  forcePathStyle?: boolean;
}

interface GitHubBackupSettings extends BackupSettingsCommon {
  provider: 'github';
  owner: string;
  repo: string;
  branch: string;            // 默认 main
  /** 仓库内目录，如 "vault-backups"。 */
  pathPrefix: string;
  /** fine-grained 或 classic PAT；须含 contents: read/write。 */
  token: string;
}
```

**切换提供商：** 设置页以单选切换 `provider`。非激活提供商的字段可保留在 `data.json` 中但**不参与**连接测试与 push/pull，UI 标明「未启用」。保存时校验：禁止同时设置两个 `provider: 's3'` 与 `provider: 'github'`（类型系统保证）。

### 19.2 备份范围

| `scope` | 包含路径 | 典型用途 |
|---------|----------|----------|
| `full` | Vault 根下全部文件（减去排除项） | 完整灾备 |
| `enterpriseflow` | `raw/`、`wiki/`、`schema/`、`workflows/`、`.enterpriseflow/`（`extracts/` 受 `includeExtractCache` 控制） | 仅 EnterpriseFlow 数据 |

**默认排除（两种 scope 均适用）：**

- `.obsidian/workspace.json`、`.obsidian/workspace-mobile.json`
- `.trash/**`
- `**/.DS_Store`

`scope: full` 仍包含用户普通笔记与 `.obsidian` 配置（除上述 workspace 文件）。

### 19.3 快照格式

本地打包与远端存储使用**统一工件**，与提供商无关：

```
snapshot-{snapshotId}.zip
manifest-{snapshotId}.json   # 可与 zip 同次上传；亦打包在 zip 根目录 manifest.json
```

```typescript
interface BackupManifest {
  schemaVersion: 1;
  snapshotId: string;       // ISO-8601 紧凑时间戳，如 20260618T120000Z
  vaultName: string;
  createdAt: string;
  pluginVersion: string;
  scope: BackupScope;
  includeExtractCache: boolean;
  fileCount: number;
  totalBytes: number;
  /** zip 字节的 sha256(hex)。 */
  contentHash: string;
  excludes: string[];
  /** 逐文件元数据，供 restore merge 比较；路径为 Vault 相对 POSIX 路径。 */
  files: BackupManifestEntry[];
}

interface BackupManifestEntry {
  path: string;
  size: number;
  /** 打包时自 Vault 文件 mtime 读取的 ISO-8601 时间戳。 */
  modifiedAt: string;
  /** 文件内容 sha256(hex)。 */
  contentHash: string;
}

type BackupScope = 'full' | 'enterpriseflow';
```

zip 内路径均为 **Vault 相对路径**（POSIX），保留目录结构；不含绝对路径。

### 19.4 提供商路径约定

**S3（及兼容实现）：**

```
s3://{bucket}/{prefix}/snapshots/{snapshotId}/snapshot.zip
s3://{bucket}/{prefix}/snapshots/{snapshotId}/manifest.json
s3://{bucket}/{prefix}/latest.json    # 指向最近 snapshotId 的指针文件
```

**GitHub：**

```
{pathPrefix}/snapshots/{snapshotId}/snapshot.zip
{pathPrefix}/snapshots/{snapshotId}/manifest.json
{pathPrefix}/latest.json
```

通过 [GitHub Contents API](https://docs.github.com/en/rest/repos/contents) 上传/下载；同一文件更新时带 `sha` 乐观锁。二进制以 base64 传输（有效载荷约为原始字节的 **4/3**，单文件 API 上限约 **100 MB** → 未压缩 zip 建议 ≤ **75 MB**，见 R15）。

### 19.5 BackupService API

```typescript
interface BackupService {
  /** 验证当前 provider 凭据与目标可达。 */
  testConnection(): Promise<void>;

  /** 列出远端快照（按 createdAt 降序）。 */
  listSnapshots(): Promise<BackupSnapshotInfo[]>;

  /** 打包并上传。 */
  push(options?: BackupPushOptions): Promise<BackupReport>;

  /** 下载并恢复。 */
  pull(options: RestoreOptions): Promise<RestoreReport>;
}

interface BackupSnapshotInfo {
  snapshotId: string;
  createdAt: string;
  contentHash: string;
  totalBytes: number;
  scope: BackupScope;
}

interface BackupPushOptions {
  /** 覆盖 settings 中的 scope。 */
  scope?: BackupScope;
  signal?: AbortSignal;
}

interface RestoreOptions {
  /** 默认拉取 latest.json 指向的快照。 */
  snapshotId?: string;
  /**
   * merge：写入 zip 中文件，当本地不存在，或 manifest 中该路径 `contentHash` 与本地不同，
   * 或 `modifiedAt` 新于本地（本地无文件时仅看快照侧）。不删除本地独有文件。
   * replace：以快照为准覆盖整个 scope 范围；删除快照内不存在但本地存在的 scope 内文件（危险）。
   */
  mode: 'merge' | 'replace';
  /** 仅预览将新增/覆盖/删除的路径，不写盘。 */
  dryRun?: boolean;
  signal?: AbortSignal;
}

interface BackupReport {
  snapshotId: string;
  provider: BackupProvider;
  status: 'completed' | 'failed' | 'cancelled';
  uploadedBytes: number;
  durationMs: number;
  error?: string;
}

interface RestoreReport {
  snapshotId: string;
  provider: BackupProvider;
  status: 'completed' | 'failed' | 'cancelled';
  mode: 'merge' | 'replace';
  filesAdded: number;
  filesUpdated: number;
  filesDeleted: number;   // replace 模式
  dryRun: boolean;
  error?: string;
}
```

**并发：** 同一 Vault 同时仅允许一个 `backup-push` 或 `backup-pull` 任务。

**恢复后：** 发布 `restore:done`（载荷含 `RestoreReport`）。**UI 外壳**（[§6.4](#64-ui-外壳-srcuimaints)）解析 `filesAdded` / `filesUpdated` 路径，推导受影响 `wikiId` 集合，提示用户对相应 Wiki 执行 `regenerateIndex`（不自动全量 ingest）。若 `includeExtractCache: false` 且恢复了 `wiki/` 而本地无匹配 extracts，摄取仍可在下次命中时重建缓存。

### 19.6 用户界面与命令

| 入口 | 行为 |
|------|------|
| 设置 → 备份 | 选择 `none` / `s3` / `github`；填写对应表单；「测试连接」 |
| 命令：备份到远端 | `BackupService.push()` |
| 命令：从远端恢复 | 选择快照 → `dryRun` 预览 → 确认 → `pull` |
| 状态栏 | 显示上次备份时间与结果 |

`replace` 模式必须在命令面板 / 模态框中二次确认，展示 `filesDeleted` 预估。

### 19.7 与工作流集成

| 节点 type | 说明 |
|-----------|------|
| `vault.backup.push` | 可选 `data.scope`；委托 `BackupService.push` |
| `vault.backup.pull` | `data.snapshotId`、`data.mode`（**禁止**未确认的 `replace`，除非 `data.confirmed: true` 且来自手动触发器） |

典型流：定时 `trigger` → `vault.backup.push` → `output.notice`。

### 19.8 非目标（备份 v0）

- 不实现 S3 与 GitHub **同时**增量同步。
- 不做块级增量备份（v0 全量 zip）。
- 不用 GitHub 作版本化 Markdown 逐文件同步（仅快照工件）。
- 不替代 Obsidian Sync / iCloud / 网盘客户端。
- v0 不内置 Git LFS；超大 Vault（压缩后仍 > 75 MB）须使用 S3 或手动拆分。

---

## 附录 A — `CachedExtract` 与绑定后 `NormalizedDocument` 示例

**磁盘缓存（`extract.json`，无 wikiId）：**

```json
{
  "schemaVersion": 1,
  "contentHash": "a1b2c3…",
  "mimeType": "application/pdf",
  "title": "Annual Report 2025",
  "language": "en",
  "fullText": "# Annual Report 2025\n\n…",
  "chunks": [
    {
      "id": "chunk-001",
      "text": "Revenue grew 12% year over year…",
      "locator": { "kind": "pdf", "page": 3, "pageCount": 48 },
      "sequence": 1
    }
  ],
  "metadata": {
    "extractedAt": "2026-06-18T10:00:00.000Z",
    "extractorId": "pdf-text",
    "extractorVersion": "1.0.0",
    "pluginVersion": "0.1.0",
    "stats": { "format": "pdf", "pageCount": 48, "ocrUsed": false }
  }
}
```

**绑定后（内存 / 摄取输入，含 wikiId、sourceId）：**

```json
{
  "schemaVersion": 1,
  "wikiId": "legal",
  "sourceId": "raw/legal/contracts/annual-report.pdf",
  "contentHash": "a1b2c3…",
  "mimeType": "application/pdf",
  "title": "Annual Report 2025",
  "language": "en",
  "fullText": "# Annual Report 2025\n\n…",
  "chunks": [{ "id": "chunk-001", "text": "…", "locator": { "kind": "pdf", "page": 3, "pageCount": 48 }, "sequence": 1 }],
  "metadata": { "extractedAt": "2026-06-18T10:00:00.000Z", "extractorId": "pdf-text", "extractorVersion": "1.0.0", "pluginVersion": "0.1.0", "stats": { "format": "pdf", "pageCount": 48, "ocrUsed": false } }
}
```

## 附录 B — 参考资料

- [Karpathy LLM Wiki (gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [obsidian-llm-wiki](https://github.com/green-dalii/obsidian-llm-wiki) — Wiki 引擎模式（摄取、Lint、问答）
- [Dify 工作流模型](https://docs.dify.ai/) — 可视化 DAG 参考（API 不兼容）
