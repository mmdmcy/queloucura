import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

import { buildSystemPrompt, HARNESS_PROFILES } from "../core/harnessProfiles";
import { PROBES } from "../core/probes";
import { buildResponseStats, diagnoseMarkdown } from "../core/metrics";
import { callOllama, listOllamaModels } from "../providers/ollama";
import { callOpenAICompatible } from "../providers/openaiCompatible";
import type { ApiError, ChatMessage, ChatRequest, ChatResponse, ProviderConfig } from "../shared/types";

const port = Number(process.env.PORT || 8787);
const staticRoot = resolve(process.cwd(), "dist/client");
const maxBodyBytes = 1_000_000;

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendError(response: ServerResponse, status: number, error: string, detail?: string): void {
  const payload: ApiError = detail ? { error, detail } : { error };
  sendJson(response, status, payload);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new Error("Request body is too large.");
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function validateChatRequest(value: ChatRequest): void {
  if (!value.provider?.kind) {
    throw new Error("provider.kind is required.");
  }

  if (!value.provider.model?.trim()) {
    throw new Error("provider.model is required.");
  }

  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    throw new Error("At least one message is required.");
  }

  for (const message of value.messages) {
    if (!["user", "assistant"].includes(message.role)) {
      throw new Error("Request messages may only use user or assistant roles.");
    }

    if (!message.content.trim()) {
      throw new Error("Message content cannot be blank.");
    }
  }
}

function composeMessages(request: ChatRequest): { profileName: string; stressors: string[]; messages: ChatMessage[] } {
  const profile = buildSystemPrompt(request.profileId, request.settings);
  return {
    profileName: profile.name,
    stressors: profile.stressors,
    messages: [{ role: "system", content: profile.systemPrompt }, ...request.messages]
  };
}

async function runProvider(provider: ProviderConfig, messages: ChatMessage[], temperature: number) {
  if (provider.kind === "ollama") {
    return callOllama(provider, messages, temperature);
  }

  if (provider.kind === "openai-compatible") {
    return callOpenAICompatible(provider, messages, temperature);
  }

  throw new Error(`Unsupported provider: ${provider.kind}`);
}

async function handleChat(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody<ChatRequest>(request);
  validateChatRequest(body);

  const { profileName, stressors, messages } = composeMessages(body);
  const started = performance.now();
  const providerResult = await runProvider(body.provider, messages, body.settings.temperature);
  const elapsedMs = Math.round(performance.now() - started);
  const stats = buildResponseStats(messages, providerResult.content, elapsedMs, providerResult.usage);
  const result: ChatResponse = {
    content: providerResult.content,
    provider: {
      kind: body.provider.kind,
      model: body.provider.model
    },
    harness: {
      id: body.profileId,
      name: profileName,
      stressors
    },
    stats,
    diagnostics: diagnoseMarkdown(providerResult.content)
  };

  sendJson(response, 200, result);
}

async function handleModels(url: URL, response: ServerResponse): Promise<void> {
  const provider = url.searchParams.get("provider");

  if (provider !== "ollama") {
    sendJson(response, 200, { models: [] });
    return;
  }

  const baseUrl = url.searchParams.get("baseUrl") || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const models = await listOllamaModels(baseUrl);
  sendJson(response, 200, { models });
}

function serveStatic(response: ServerResponse, url: URL, headOnly = false): void {
  if (!existsSync(staticRoot)) {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Queloucura API is running. Build the client with npm run dev:client or npm run build.");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(staticRoot, requestedPath));
  const relativePath = relative(staticRoot, filePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    sendError(response, 403, "Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const headers = {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
  };

  response.writeHead(200, headers);

  if (headOnly) {
    response.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.pipe(response);
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profiles") {
      sendJson(response, 200, { profiles: HARNESS_PROFILES, probes: PROBES });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/models") {
      await handleModels(url, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      serveStatic(response, url, request.method === "HEAD");
      return;
    }

    sendError(response, 404, "Not found");
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    sendError(response, 500, "Request failed", message);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Queloucura API listening on http://127.0.0.1:${port}`);
});
