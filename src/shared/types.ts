export type ChatRole = "system" | "user" | "assistant";

export type ProviderKind = "openai-compatible" | "ollama";

export type HarnessProfileId =
  | "direct"
  | "enterprise-productivity-inspired"
  | "overconstrained"
  | "sandbox-artifact";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ProviderConfig {
  kind: ProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface HarnessSettings {
  temperature: number;
  citationPressure: number;
  artifactPressure: number;
  safetyPressure: number;
  answerWhenUnsure: boolean;
}

export interface HarnessProfile {
  id: HarnessProfileId;
  name: string;
  summary: string;
  systemPrompt: string;
  stressors: string[];
}

export interface Probe {
  id: string;
  name: string;
  prompt: string;
  expectedFailureSignals: string[];
}

export interface ChatRequest {
  provider: ProviderConfig;
  profileId: HarnessProfileId;
  messages: ChatMessage[];
  settings: HarnessSettings;
}

export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptEvalCount?: number;
  evalCount?: number;
  totalDurationMs?: number;
}

export interface MarkdownDiagnostics {
  codeFenceCount: number;
  hasUnclosedCodeFence: boolean;
  markdownLinkCount: number;
  emptyQuotePairCount: number;
  malformedLinkHintCount: number;
  downloadClaimWithoutLink: boolean;
  toolClaimCount: number;
  citationWithoutUrlCount: number;
  issueCount: number;
}

export interface ResponseStats {
  elapsedMs: number;
  promptChars: number;
  responseChars: number;
  approxPromptTokens: number;
  approxResponseTokens: number;
  charsPerSecond: number;
  usage?: ProviderUsage;
}

export interface ChatResponse {
  content: string;
  provider: {
    kind: ProviderKind;
    model: string;
  };
  harness: {
    id: HarnessProfileId;
    name: string;
    stressors: string[];
  };
  stats: ResponseStats;
  diagnostics: MarkdownDiagnostics;
}

export interface ApiError {
  error: string;
  detail?: string;
}
