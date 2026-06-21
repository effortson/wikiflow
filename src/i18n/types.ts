export type UiLocale = "en" | "zh";

export interface CommandMessages {
  ingestCurrentFile: string;
  ingestActiveWiki: string;
  extractRawActiveWiki: string;
  extractCurrentRawFile: string;
  queryActiveWiki: string;
  openWikiQuery: string;
  lintActiveWiki: string;
  regenerateIndex: string;
  generateWikiSchema: string;
  openWorkflowCanvas: string;
  runWorkflow: string;
  backupPush: string;
  backupRestore: string;
  validateWorkflow: string;
}

export interface NoticeMessages {
  workflowInvalid: string;
  runningWorkflow: string;
  workflowRunResult: string;
  workflowRunFailed: string;
  workflowValid: string;
  workflowInvalidWithCount: string;
  validationFailed: string;
  regeneratingIndex: string;
  indexRebuilt: string;
  indexRebuildFailed: string;
  llmNotConfigured: string;
  ingestingWiki: string;
  wikiIngestFailed: string;
  wikiIngestResult: string;
  wikiIngestError: string;
  fileMustBeUnderSource: string;
  fileMustBeUnderRaw: string;
  extractingRawWiki: string;
  extractingRawFile: string;
  extractRawComplete: string;
  extractRawFailed: string;
  extractRawError: string;
  ingestingFile: string;
  ingestFailed: string;
  ingestComplete: string;
  ingestError: string;
  restoreCompleteRegenerate: string;
  generatingSchema: string;
  schemaGeneratedDefault: string;
  schemaGeneratedFromSource: string;
  schemaGenerateFailed: string;
  rawRootViolation: string;
  rawRootViolationMore: string;
}

export interface ProgressMessages {
  ingestFile: string;
  ingestWiki: string;
  wikiPreparing: string;
  stepStarting: string;
  stepExtracting: string;
  stepExtractCached: string;
  stepConverting: string;
  stepAnalyzing: string;
  stepWriting: string;
  stepIndexing: string;
  stepSkipping: string;
  stepComplete: string;
  stepFailed: string;
}

export interface SettingsMessages {
  headings: {
    paths: string;
    wiki: string;
    remoteBackup: string;
  };
  llm: {
    apiKey: string;
    apiKeyDesc: string;
    baseUrl: string;
    baseUrlDesc: string;
    model: string;
    testConnection: string;
    testConnectionDesc: string;
    testSuccess: string;
    testFailed: string;
    testMissingConfig: string;
  };
  paths: {
    relativeDesc: string;
    rawFolder: string;
    sourceFolder: string;
    wikiRoot: string;
    schemaRoot: string;
    workflowsFolder: string;
  };
  wiki: {
    activeWiki: string;
    activeWikiDesc: string;
    language: string;
    languageDesc: string;
    languageZh: string;
    languageEn: string;
    none: string;
    fileDebounce: string;
    fileDebounceDesc: string;
    showQueryPrompts: string;
    showQueryPromptsDesc: string;
    debugLogging: string;
  };
  backup: {
    provider: string;
    providerDesc: string;
    none: string;
    s3: string;
    github: string;
    scope: string;
    scopeWikiFlow: string;
    scopeFull: string;
    includeExtractCache: string;
    retentionCount: string;
    retentionCountDesc: string;
    scheduled: string;
    scheduleInterval: string;
    testConnection: string;
    connectionOk: string;
    connectionFailed: string;
  };
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: string;
    forcePathStyleDesc: string;
  };
  github: {
    owner: string;
    repo: string;
    branch: string;
    pathPrefix: string;
    token: string;
  };
}

export interface QueryViewMessages {
  title: string;
  mode: string;
  modeWiki: string;
  modeWorkflow: string;
  wiki: string;
  wikiDesc: string;
  wikiDescWorkflow: string;
  workflow: string;
  workflowDesc: string;
  noWorkflow: string;
  workflowInvalid: string;
  workflowRunning: string;
  workflowNoAnswer: string;
  workflowRunTitle: string;
  question: string;
  questionPlaceholder: string;
  questionPlaceholderWorkflow: string;
  ask: string;
  clear: string;
  hint: string;
  thinking: string;
  llmNotConfigured: string;
  noWiki: string;
  citations: string;
  emptyAnswer: string;
  emptyAnswerTitle: string;
  emptyAnswerHint: string;
  answerTitle: string;
  answerNote: string;
  copyAnswer: string;
  copied: string;
  submit: string;
  elapsedSeconds: string;
  systemPrompt: string;
  userPrompt: string;
  promptVarsHint: string;
  resetPrompt: string;
}

export interface UiMessages {
  pluginName: string;
  commands: CommandMessages;
  ribbon: {
    openWorkflowCanvas: string;
    openQueryView: string;
  };
  statusBar: {
    llmReady: string;
    llmNotConfigured: string;
    backupOff: string;
    backupProvider: string;
    backupSnapshot: string;
    backupFailed: string;
    ingestActive: string;
  };
  progress: ProgressMessages;
  settings: SettingsMessages;
  notices: NoticeMessages;
  queryView: QueryViewMessages;
}
