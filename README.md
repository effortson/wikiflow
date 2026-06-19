# WikiFlow

Obsidian 插件：将 Vault 中的原始文档摄取为 **LLM Wiki** 知识库，并通过可视化 **Workflow** 编排自动化流程。

- **Wiki**：PDF / Word / Excel / 图片 / 纯文本 → 结构化 Markdown 页面、实体与概念图谱、关键词检索 + LLM 问答
- **Workflow**：React Flow 画布编辑器，支持子工作流、LLM 节点、Wiki 批量查询、文件触发等
- **Backup**：可选 S3 或 GitHub 远程快照备份

> 需要 Obsidian **桌面版 v1.11.0+**（使用 `requestUrl` 与本地文件 API）。

## 功能概览

| 模块 | 能力 |
|------|------|
| **摄取** | `raw/{wikiId}/` 下文件抽取、缓存、生成 `wiki/{wikiId}/` 页面 |
| **Wiki 问答** | 关键词召回 + LLM 重排；可编辑系统/用户提示词；支持 Workflow 模式 |
| **Workflow** | 可视化编辑 `.workflow.json`；运行状态动画；用户输入弹窗 |
| **备份** | 打包 Vault 内 WikiFlow 相关路径，上传 S3 / GitHub |

## Vault 目录结构

```
raw/{wikiId}/          # 原始文件（每个一级子目录 = 一个 Wiki 实例）
source/{wikiId}/       # 可选：抽取后的中间 Markdown
wiki/{wikiId}/         # 生成的知识页（entities、concepts、sources…）
schema/{wikiId}/       # Wiki  schema 与标签词汇
workflows/             # 工作流定义（*.workflow.json）
.wikiflow/             # 插件运行时数据（抽取缓存、运行日志等）
```

**规则：** `raw/` 下的一级子目录名即 `wikiId`（如 `raw/legal/` → Wiki `legal`）。更深层子目录不是独立 Wiki。

## 安装

### 从源码开发

```bash
git clone git@github.com:effortson/wikiflow.git
cd wikiflow
npm install
npm run build
```

在 Vault 中创建符号链接（将 `VAULT` 替换为你的库路径）：

```bash
ln -s /path/to/wikiflow "/path/to/VAULT/.obsidian/plugins/wikiflow"
```

在 Obsidian：**设置 → 社区插件 → 重新加载** 并启用 **WikiFlow**。

开发时可用 `npm run dev` 监听构建。

### 配置 LLM

**设置 → WikiFlow** 中填写 API Key、Base URL、Model，点击测试连接。Wiki 问答与 Workflow 中的 LLM 节点均依赖此配置。

## 快速开始

1. 创建 Wiki：`mkdir -p raw/my-wiki` 并放入 PDF 等文件
2. **命令面板** → `WikiFlow: Ingest active wiki`（或摄取单个文件）
3. 点击功能区 **搜索图标** 打开 **Wiki 问答**，选择 Wiki 后提问

## Wiki 问答

支持两种模式（同一行切换）：

| 模式 | 说明 |
|------|------|
| **Wiki 直查** | 内置检索 + LLM 生成回答，可折叠编辑系统/用户提示词 |
| **Workflow** | 选择 `.workflow.json`，问题传入 `trigger.user-input`，结果来自 `output.text` |

Workflow 问答要求工作流：

- **唯一入口**：`trigger.user-input`（无入边）
- **唯一出口**：`output.text`（无出边）

示例：`workflows/rag-multi-query.workflow.json`（扩展子问题 → 批量 Wiki 查询 → LLM 汇总）。

提示词模板变量（Wiki 直查）：

- `{{wikiId}}` `{{question}}` `{{context}}` `{{languageInstruction}}`

## Workflow 编辑器

- 功能区 **分支图标** 或命令 `WikiFlow: Open workflow canvas`
- 拖拽节点、连线、Inspector 配置
- **Save** 写入当前 `.workflow.json`；**Run** 时若有 `trigger.user-input` 会弹出输入框
- 运行中节点边框动画、边沿流动光点

内置节点包括：`wiki.ingest`、`wiki.query`、`wiki.query-batch`、`llm.chat`、`workflow.subworkflow`、`trigger.file-added` 等。

## 常用命令

- `WikiFlow: Ingest active wiki` / `Ingest current file`
- `WikiFlow: Open wiki query`
- `WikiFlow: Open workflow canvas` / `Run workflow`
- `WikiFlow: Lint active wiki` / `Regenerate query index`
- `WikiFlow: Backup push` / `Backup restore`

## 开发

```bash
npm run lint      # ESLint
npm test          # Vitest
npm run build     # 生产构建
npm run check     # lint + tsc + test + build
```

架构与实现细节见 [`specs/ARCHITECTURE.md`](specs/ARCHITECTURE.md)、[`specs/IMPLEMENTATION.md`](specs/IMPLEMENTATION.md)。

## 许可证

MIT
