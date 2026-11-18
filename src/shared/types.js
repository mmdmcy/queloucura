// Shared JSDoc types for the server, the providers and the browser client.
// This module has no runtime code; other files refer to it in their JSDoc
// comments as `import("../shared/types.js").Name`.

/** @typedef {"system" | "user" | "assistant"} ChatRole */

/** @typedef {"openai-compatible" | "ollama"} ProviderKind */

/**
 * @typedef {"direct"
 *   | "enterprise-productivity-inspired"
 *   | "overconstrained"
 *   | "sandbox-artifact"} HarnessProfileId
 */

/**
 * @typedef {object} ChatMessage
 * @property {ChatRole} role
 * @property {string} content
 */

/**
 * @typedef {object} ProviderConfig
 * @property {ProviderKind} kind
 * @property {string} model
 * @property {string} [baseUrl]
 * @property {string} [apiKey]
 */

/**
 * @typedef {object} HarnessSettings
 * @property {number} temperature
 * @property {number} citationPressure
 * @property {number} artifactPressure
 * @property {number} safetyPressure
 * @property {boolean} answerWhenUnsure
 */

/**
 * @typedef {object} HarnessProfile
 * @property {HarnessProfileId} id
 * @property {string} name
 * @property {string} summary
 * @property {string} systemPrompt
 * @property {string[]} stressors
 */

/**
 * @typedef {object} Probe
 * @property {string} id
 * @property {string} name
 * @property {string} prompt
 * @property {string[]} expectedFailureSignals
 */

/**
 * @typedef {object} ChatRequest
 * @property {ProviderConfig} provider
 * @property {HarnessProfileId} profileId
 * @property {ChatMessage[]} messages
 * @property {HarnessSettings} settings
 */

/**
 * @typedef {object} ProviderUsage
 * @property {number} [promptTokens]
 * @property {number} [completionTokens]
 * @property {number} [totalTokens]
 * @property {number} [promptEvalCount]
 * @property {number} [evalCount]
 * @property {number} [totalDurationMs]
 */

/**
 * @typedef {object} ProviderResult
 * @property {string} content
 * @property {ProviderUsage} [usage]
 */

/**
 * @typedef {object} MarkdownDiagnostics
 * @property {number} codeFenceCount
 * @property {boolean} hasUnclosedCodeFence
 * @property {number} markdownLinkCount
 * @property {number} emptyQuotePairCount
 * @property {number} malformedLinkHintCount
 * @property {boolean} downloadClaimWithoutLink
 * @property {number} toolClaimCount
 * @property {number} citationWithoutUrlCount
 * @property {number} issueCount
 */

/**
 * @typedef {object} ResponseStats
 * @property {number} elapsedMs
 * @property {number} promptChars
 * @property {number} responseChars
 * @property {number} approxPromptTokens
 * @property {number} approxResponseTokens
 * @property {number} charsPerSecond
 * @property {ProviderUsage} [usage]
 */

/**
 * @typedef {object} ChatResponse
 * @property {string} content
 * @property {{ kind: ProviderKind, model: string }} provider
 * @property {{ id: HarnessProfileId, name: string, stressors: string[] }} harness
 * @property {ResponseStats} stats
 * @property {MarkdownDiagnostics} diagnostics
 */

/**
 * @typedef {object} ApiError
 * @property {string} error
 * @property {string} [detail]
 */

export {};
