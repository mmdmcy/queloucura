/** @typedef {import("../shared/types.js").ChatMessage} ChatMessage */
/** @typedef {import("../shared/types.js").ProviderConfig} ProviderConfig */
/** @typedef {import("../shared/types.js").ProviderUsage} ProviderUsage */
/** @typedef {import("../shared/types.js").ProviderResult} ProviderResult */

/**
 * The fields of Ollama's /api/chat answer that this adapter reads.
 * @typedef {object} OllamaChatResponse
 * @property {{ content?: string }} [message]
 * @property {number} [prompt_eval_count]
 * @property {number} [eval_count]
 * @property {number} [total_duration] nanoseconds
 */

/**
 * @typedef {object} OllamaTagsResponse
 * @property {{ name: string, model?: string }[]} [models]
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
export async function callOllama(provider, messages, temperature) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434");
  const model = provider.model || process.env.OLLAMA_MODEL || "llama3.1";
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature
      }
    })
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${bodyText.slice(0, 800)}`);
  }

  /** @type {OllamaChatResponse} */
  const body = JSON.parse(bodyText);
  const content = body.message?.content;

  if (!content) {
    throw new Error("Ollama response did not include message content.");
  }

  /** @type {ProviderUsage} */
  const usage = {};

  if (typeof body.prompt_eval_count === "number") {
    usage.promptEvalCount = body.prompt_eval_count;
  }

  if (typeof body.eval_count === "number") {
    usage.evalCount = body.eval_count;
  }

  if (typeof body.total_duration === "number") {
    usage.totalDurationMs = Math.round(body.total_duration / 1_000_000);
  }

  return { content, usage };
}

/**
 * @param {string} baseUrl
 * @returns {Promise<string[]>}
 */
export async function listOllamaModels(baseUrl) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tags`);

  if (!response.ok) {
    throw new Error(`Ollama model listing failed (${response.status}).`);
  }

  /** @type {OllamaTagsResponse} */
  const body = await response.json();

  return [
    ...new Set(
      /** @type {string[]} */ ((body.models || []).map((model) => model.name || model.model).filter(Boolean))
    )
  ].sort();
}
