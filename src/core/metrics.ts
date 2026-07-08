import type {
  ChatMessage,
  MarkdownDiagnostics,
  ProviderUsage,
  ResponseStats
} from "../shared/types";

export function approxTokens(text: string): number {
  const compact = text.trim();
  if (!compact) {
    return 0;
  }

  return Math.max(1, Math.ceil(compact.length / 4));
}

export function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

export function diagnoseMarkdown(text: string): MarkdownDiagnostics {
  const codeFenceCount = countMatches(text, /```/g);
  const markdownLinkCount = countMatches(text, /\[[^\]\n]+\]\([^) \n][^) \n]*\)/g);
  const emptyQuotePairCount = countMatches(text, /''/g);
  const malformedLinkHintCount =
    countMatches(text, /\[[^\]\n]+\]\(\s*\)/g) + countMatches(text, /\[[^\]\n]+\]\s+(?:here|download|file)/gi);
  const downloadClaimWithoutLink =
    /\b(download|downloadable|attached|attachment|file is ready|click here)\b/i.test(text) && markdownLinkCount === 0;
  const toolClaimCount = countMatches(
    text,
    /\b(I ran|I've run|I created|I've created|I uploaded|I've uploaded|attached|sandbox output|command output)\b/gi
  );
  const citationWithoutUrlCount = Math.max(0, countMatches(text, /\[(?:\d+|source|citation)[^\]]*\]/gi) - markdownLinkCount);

  const issueCount =
    (codeFenceCount % 2 === 1 ? 1 : 0) +
    emptyQuotePairCount +
    malformedLinkHintCount +
    (downloadClaimWithoutLink ? 1 : 0) +
    toolClaimCount +
    citationWithoutUrlCount;

  return {
    codeFenceCount,
    hasUnclosedCodeFence: codeFenceCount % 2 === 1,
    markdownLinkCount,
    emptyQuotePairCount,
    malformedLinkHintCount,
    downloadClaimWithoutLink,
    toolClaimCount,
    citationWithoutUrlCount,
    issueCount
  };
}

export function buildResponseStats(
  messages: ChatMessage[],
  content: string,
  elapsedMs: number,
  usage?: ProviderUsage
): ResponseStats {
  const promptText = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
  const seconds = Math.max(elapsedMs / 1000, 0.001);
  const stats: ResponseStats = {
    elapsedMs,
    promptChars: promptText.length,
    responseChars: content.length,
    approxPromptTokens: approxTokens(promptText),
    approxResponseTokens: approxTokens(content),
    charsPerSecond: Math.round(content.length / seconds)
  };

  if (usage) {
    stats.usage = usage;
  }

  return stats;
}
