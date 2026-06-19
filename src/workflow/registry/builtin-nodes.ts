import type { TFile } from "obsidian";
import type { PluginSettings } from "../../core/config/settings";
import { showNotice as displayNotice } from "../../ui/notice";
import { resolveWikiId } from "../../wiki/instance-resolver";
import {
  variablesToRecord,
  type WorkflowContext,
} from "../runtime/context";
import {
  evaluateBranchIf,
  resolveRecord,
  resolveTemplate,
  type BranchIfConfig,
} from "../runtime/template";
import {
  coerceQuestionSource,
  formatWikiQueryResults,
  parseMaxQuestions,
  parseQuestionsInput,
  stripLlmNoise,
} from "../shared/parse-questions";
import { queryWikiAnswer, queryWikiAnswersBatch } from "../shared/query-wiki";
import { NodeRegistry } from "./node-registry";

export interface BuiltinNodesOptions {
  getSettings: () => PluginSettings;
  notice?: (message: string) => void;
  runSubworkflow: (
    ctx: WorkflowContext,
    config: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

export function createBuiltinNodeRegistry(
  options: BuiltinNodesOptions,
): NodeRegistry {
  const registry = new NodeRegistry();
  const showNotice = options.notice ?? ((msg) => displayNotice(msg));

  registry.register({
    type: "trigger.manual",
    label: "Manual trigger",
    inputs: {},
    outputs: {},
    async execute(ctx, _config, inputs) {
      return { ...variablesToRecord(ctx.variables), ...inputs };
    },
  });

  registry.register({
    type: "trigger.file-added",
    label: "File added trigger",
    inputs: {},
    outputs: {},
    async execute(ctx, _config, inputs) {
      return { ...variablesToRecord(ctx.variables), ...inputs };
    },
  });

  registry.register({
    type: "trigger.user-input",
    label: "User input trigger",
    inputs: {},
    outputs: {},
    async execute(ctx, config, inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const preset =
        (inputs.text as string | undefined) ??
        (inputs.input as string | undefined) ??
        (ctx.variables.get("text") as string | undefined);
      const text =
        preset !== undefined && preset !== null ? String(preset).trim() : "";
      if (!text) {
        const label = (resolved.prompt as string | undefined) ?? "prompt";
        throw new Error(
          `trigger.user-input requires text in run inputs (${label})`,
        );
      }

      return {
        ...variablesToRecord(ctx.variables),
        ...inputs,
        text,
        input: text,
      };
    },
  });

  registry.register({
    type: "file.pick",
    label: "Pick file",
    inputs: {},
    outputs: {},
    async execute(ctx, config, inputs) {
      const settings = options.getSettings();
      const resolved = resolveRecord(config, ctx.variables);
      const path =
        (resolved.path as string | undefined) ??
        (inputs.path as string | undefined) ??
        (ctx.variables.get("path") as string | undefined) ??
        (inputs.file as { path?: string } | undefined)?.path;

      if (!path) {
        throw new Error("file.pick requires a file path");
      }

      const wikiId =
        (resolved.wikiId as string | undefined) ??
        resolveWikiId(path, settings.sourceFolder) ??
        resolveWikiId(path, settings.rawFolder) ??
        ctx.wikiId;

      if (!wikiId) {
        throw new Error("file.pick could not resolve wikiId");
      }

      const vault = ctx.services.vault.getVault();
      const file = vault.getAbstractFileByPath(path);
      if (!file || !("extension" in file)) {
        throw new Error(`File not found: ${path}`);
      }

      return {
        pickedFile: file as TFile,
        path,
        wikiId,
      };
    },
  });

  registry.register({
    type: "doc.extract",
    label: "Extract document",
    inputs: {},
    outputs: {},
    async execute(ctx, config, inputs) {
      const file =
        (inputs.file as TFile | undefined) ??
        (inputs.pickedFile as TFile | undefined);
      if (!file) {
        throw new Error("doc.extract requires a file input");
      }

      const resolved = resolveRecord(config, ctx.variables);
      const wikiId = resolved.wikiId as string | undefined;
      const document = await ctx.services.wiki.extract(file, {
        wikiId,
      });
      return { document };
    },
  });

  registry.register({
    type: "wiki.ingest",
    label: "Wiki ingest",
    inputs: {},
    outputs: {},
    async execute(ctx, config, inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const wikiId = resolved.wikiId as string | undefined;
      if (!wikiId) {
        throw new Error("wiki.ingest requires wikiId in node data");
      }

      const document = inputs.document;
      if (!document) {
        throw new Error("wiki.ingest requires document input");
      }

      const report = await ctx.services.wiki.ingest(
        document as Parameters<typeof ctx.services.wiki.ingest>[0],
        { wikiId },
      );
      return { report, ingestReport: report };
    },
  });

  registry.register({
    type: "wiki.query",
    label: "Wiki query",
    inputs: {},
    outputs: {},
    async execute(ctx, config, _inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const wikiId = resolved.wikiId as string | undefined;
      if (!wikiId) {
        throw new Error("wiki.query requires wikiId in node data");
      }

      const question = resolved.question as string | undefined;
      if (!question) {
        throw new Error("wiki.query requires question");
      }

      const answer = await queryWikiAnswer(
        ctx.services.wiki,
        wikiId,
        question,
        ctx.signal,
      );

      return { answer };
    },
  });

  registry.register({
    type: "wiki.query-batch",
    label: "Wiki batch query",
    inputs: {},
    outputs: {},
    async execute(ctx, config, inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const wikiId = resolved.wikiId as string | undefined;
      if (!wikiId) {
        throw new Error("wiki.query-batch requires wikiId in node data");
      }

      const rawQuestions = coerceQuestionSource(resolved.questions, inputs);
      const maxQuestions = parseMaxQuestions(resolved.maxQuestions, 5);
      const questions = parseQuestionsInput(rawQuestions, maxQuestions);
      if (questions.length === 0) {
        throw new Error("wiki.query-batch requires at least one question");
      }

      const results = await queryWikiAnswersBatch(
        ctx.services.wiki,
        wikiId,
        questions,
        ctx.signal,
      );
      const answers = results.map((item) => item.answer);

      const combined = formatWikiQueryResults(results);
      return { answers, results, combined };
    },
  });

  registry.register({
    type: "llm.chat",
    label: "LLM chat",
    inputs: {},
    outputs: {},
    async execute(ctx, config, inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const system = resolved.system as string | undefined;
      const userTemplate = resolved.user as string | undefined;
      const user =
        userTemplate !== undefined
          ? String(resolveTemplate(userTemplate, ctx.variables))
          : (inputs.prompt as string | undefined);

      if (!user) {
        throw new Error("llm.chat requires user prompt");
      }

      const messages = [];
      if (system) messages.push({ role: "system" as const, content: system });
      messages.push({ role: "user" as const, content: user });

      const text = stripLlmNoise(
        await ctx.services.llm.chat({
          messages,
          signal: ctx.signal,
        }),
      );
      return { text, summary: text };
    },
  });

  registry.register({
    type: "branch.if",
    label: "Branch if",
    inputs: {},
    outputs: {},
    async execute(ctx, config, _inputs) {
      const left = config.left as string;
      const operator = config.operator as BranchIfConfig["operator"];
      const right = config.right as string | number | boolean | undefined;
      const result = evaluateBranchIf({ left, operator, right }, ctx.variables);
      return { result };
    },
  });

  registry.register({
    type: "workflow.subworkflow",
    label: "Subworkflow",
    inputs: {},
    outputs: {},
    async execute(ctx, config, _inputs) {
      return options.runSubworkflow(ctx, config);
    },
  });

  registry.register({
    type: "vault.backup.push",
    label: "Backup push",
    inputs: {},
    outputs: {},
    async execute(ctx, config, _inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const report = await ctx.services.backup.push({
        scope: resolved.scope as "full" | "wikiflow" | undefined,
        signal: ctx.signal,
      });
      return { report };
    },
  });

  registry.register({
    type: "vault.backup.pull",
    label: "Backup pull",
    inputs: {},
    outputs: {},
    async execute(ctx, config, _inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const mode = (resolved.mode as "merge" | "replace" | undefined) ?? "merge";
      const confirmed =
        resolved.confirmed === true || resolved.confirmed === "true";

      if (mode === "replace") {
        if (!confirmed) {
          throw new Error(
            "vault.backup.pull replace mode requires data.confirmed: true",
          );
        }
        if (
          ctx.triggerType !== "trigger.manual" &&
          ctx.triggerType !== "trigger.user-input"
        ) {
          throw new Error(
            "vault.backup.pull replace mode requires a manual or user-input trigger workflow",
          );
        }
      }

      const report = await ctx.services.backup.pull({
        snapshotId: resolved.snapshotId as string | undefined,
        mode,
        signal: ctx.signal,
      });
      return { report };
    },
  });

  registry.register({
    type: "output.notice",
    label: "Output notice",
    inputs: {},
    outputs: {},
    async execute(ctx, config, _inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const message = resolved.message as string | undefined;
      if (message) showNotice(message);
      return {};
    },
  });

  registry.register({
    type: "output.text",
    label: "Output text",
    inputs: {},
    outputs: {},
    async execute(ctx, config, _inputs) {
      const resolved = resolveRecord(config, ctx.variables);
      const textTemplate = resolved.text as string | undefined;
      if (!textTemplate) {
        throw new Error("output.text requires text");
      }

      const text = String(resolveTemplate(textTemplate, ctx.variables));
      const outPath = resolved.path as string | undefined;
      if (outPath) {
        await ctx.services.vault.writeText(outPath, text);
      }

      return { text };
    },
  });

  return registry;
}
