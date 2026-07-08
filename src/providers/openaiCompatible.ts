import type { ChatMessage, ProviderConfig, ProviderUsage } from "../shared/types";

export interface ProviderResult {
  content: string;
  usage?: ProviderUsage;
}

interface OpenAICompatibleChoice {
  message?: {
    content?: string;
  };
  text?: string;
}

interface OpenAICompatibleResponse {
  choices?: OpenAICompatibleChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function callOpenAICompatible(
  provider: ProviderConfig,
  messages: ChatMessage[],
  temperature: number
): Promise<ProviderResult> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  const model = provider.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const apiKey = provider.apiKey || process.env.OPENAI_API_KEY;
  const headers: Record<string, string> = {
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

  const body = JSON.parse(bodyText) as OpenAICompatibleResponse;
  const content = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.text;

  if (!content) {
    throw new Error("OpenAI-compatible response did not include message content.");
  }

  const result: ProviderResult = { content };

  if (body.usage) {
    const usage: ProviderUsage = {};

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
