import type { ChatMessage, ProviderConfig, ProviderUsage } from "../shared/types";

import type { ProviderResult } from "./openaiCompatible";

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

interface OllamaTag {
  name: string;
  model?: string;
}

interface OllamaTagsResponse {
  models?: OllamaTag[];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function callOllama(
  provider: ProviderConfig,
  messages: ChatMessage[],
  temperature: number
): Promise<ProviderResult> {
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

  const body = JSON.parse(bodyText) as OllamaChatResponse;
  const content = body.message?.content;

  if (!content) {
    throw new Error("Ollama response did not include message content.");
  }

  const usage: ProviderUsage = {};

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

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tags`);

  if (!response.ok) {
    throw new Error(`Ollama model listing failed (${response.status}).`);
  }

  const body = (await response.json()) as OllamaTagsResponse;

  return [...new Set((body.models || []).map((model) => model.name || model.model).filter(Boolean) as string[])].sort();
}
