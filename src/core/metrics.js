/** @typedef {import("../shared/types.js").ChatMessage} ChatMessage */
/** @typedef {import("../shared/types.js").MarkdownDiagnostics} MarkdownDiagnostics */
/** @typedef {import("../shared/types.js").ProviderUsage} ProviderUsage */
/** @typedef {import("../shared/types.js").ResponseStats} ResponseStats */

/**
 * @param {string} text
 * @returns {number}
 */
export function approxTokens(text) {
  const compact = text.trim();
  if (!compact) {
    return 0;
  }

  return Math.max(1, Math.ceil(compact.length / 4));
}

/**
 * @param {string} text
 * @param {RegExp} pattern a global pattern
 * @returns {number}
 */
export function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

/**
 * @param {string} text
 * @returns {MarkdownDiagnostics}
 */
export function diagnoseMarkdown(text) {
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

/**
 * @param {ChatMessage[]} messages
 * @param {string} content
 * @param {number} elapsedMs
 * @param {ProviderUsage} [usage]
 * @returns {ResponseStats}
 */
export function buildResponseStats(messages, content, elapsedMs, usage) {
  const promptText = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
  const seconds = Math.max(elapsedMs / 1000, 0.001);
  /** @type {ResponseStats} */
  const stats = {
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
