/** @typedef {import("../shared/types.js").ChatMessage} ChatMessage */
/** @typedef {import("../shared/types.js").ProviderConfig} ProviderConfig */
/** @typedef {import("../shared/types.js").ProviderUsage} ProviderUsage */
/** @typedef {import("../shared/types.js").ProviderResult} ProviderResult */

/**
 * The fields of a /chat/completions answer that this adapter reads.
 * @typedef {object} OpenAICompatibleResponse
 * @property {{ message?: { content?: string }, text?: string }[]} [choices]
 * @property {{ prompt_tokens?: number, completion_tokens?: number, total_tokens?: number }} [usage]
 */

/**
 * @param {string} baseUrl
 * @returns {string}
 */
function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * @param {ProviderConfig} provider
 * @param {ChatMessage[]} messages
 * @param {number} temperature
 * @returns {Promise<ProviderResult>}
 */
export async function callOpenAICompatible(provider, messages, temperature) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  const model = provider.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const apiKey = provider.apiKey || process.env.OPENAI_API_KEY;
  /** @type {Record<string, string>} */
  const headers = {
    "content-type": "application/json"
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (!apiKey && /(^|\.)openai\.com$/i.test(new URL(baseUrl).hostname)) {
    throw new Error("OPENAI_API_KEY is required for the OpenAI API. Set it in .env or in the provider panel.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: false
    })
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${bodyText.slice(0, 800)}`);
  }

  /** @type {OpenAICompatibleResponse} */
  const body = JSON.parse(bodyText);
  const content = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.text;

  if (!content) {
    throw new Error("OpenAI-compatible response did not include message content.");
  }

  /** @type {ProviderResult} */
  const result = { content };

  if (body.usage) {
    /** @type {ProviderUsage} */
    const usage = {};

    if (typeof body.usage.prompt_tokens === "number") {
      usage.promptTokens = body.usage.prompt_tokens;
    }

    if (typeof body.usage.completion_tokens === "number") {
      usage.completionTokens = body.usage.completion_tokens;
    }

    if (typeof body.usage.total_tokens === "number") {
      usage.totalTokens = body.usage.total_tokens;
    }

    result.usage = usage;
  }

  return result;
}
