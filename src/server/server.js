import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSystemPrompt, HARNESS_PROFILES } from "../core/harnessProfiles.js";
import { PROBES } from "../core/probes.js";
import { buildResponseStats, diagnoseMarkdown } from "../core/metrics.js";
import { callOllama, listOllamaModels } from "../providers/ollama.js";
import { callOpenAICompatible } from "../providers/openaiCompatible.js";

/** @typedef {import("node:http").IncomingMessage} IncomingMessage */
/** @typedef {import("node:http").ServerResponse} ServerResponse */
/** @typedef {import("../shared/types.js").ApiError} ApiError */
/** @typedef {import("../shared/types.js").ChatMessage} ChatMessage */
/** @typedef {import("../shared/types.js").ChatRequest} ChatRequest */
/** @typedef {import("../shared/types.js").ChatResponse} ChatResponse */
/** @typedef {import("../shared/types.js").ProviderConfig} ProviderConfig */

const port = Number(process.env.PORT || 8787);
// The browser loads the page and its modules straight from the source tree:
// index.html, and the client, core and shared folders it imports. Nothing
// else under the repository root is served.
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const publicFolders = ["src/client/", "src/core/", "src/shared/"];
const maxBodyBytes = 1_000_000;

/** @type {Record<string, string>} */
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

/**
 * @param {ServerResponse} response
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(payload, null, 2));
}

/**
 * @param {ServerResponse} response
 * @param {number} status
 * @param {string} error
 * @param {string} [detail]
 */
function sendError(response, status, error, detail) {
  /** @type {ApiError} */
  const payload = detail ? { error, detail } : { error };
  sendJson(response, status, payload);
}

/**
 * @param {IncomingMessage} request
 * @returns {Promise<any>}
 */
async function readJsonBody(request) {
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new Error("Request body is too large.");
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * @param {ChatRequest} value
 */
function validateChatRequest(value) {
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

/**
 * @param {ChatRequest} request
 * @returns {{ profileName: string, stressors: string[], messages: ChatMessage[] }}
 */
function composeMessages(request) {
  const profile = buildSystemPrompt(request.profileId, request.settings);
  return {
    profileName: profile.name,
    stressors: profile.stressors,
    messages: [{ role: "system", content: profile.systemPrompt }, ...request.messages]
  };
}

/**
 * @param {ProviderConfig} provider
 * @param {ChatMessage[]} messages
 * @param {number} temperature
 */
async function runProvider(provider, messages, temperature) {
  if (provider.kind === "ollama") {
    return callOllama(provider, messages, temperature);
  }

  if (provider.kind === "openai-compatible") {
    return callOpenAICompatible(provider, messages, temperature);
  }

  throw new Error(`Unsupported provider: ${provider.kind}`);
}

/**
 * @param {IncomingMessage} request
 * @param {ServerResponse} response
 */
async function handleChat(request, response) {
  /** @type {ChatRequest} */
  const body = await readJsonBody(request);
  validateChatRequest(body);

  const { profileName, stressors, messages } = composeMessages(body);
  const started = performance.now();
  const providerResult = await runProvider(body.provider, messages, body.settings.temperature);
  const elapsedMs = Math.round(performance.now() - started);
  const stats = buildResponseStats(messages, providerResult.content, elapsedMs, providerResult.usage);
  /** @type {ChatResponse} */
  const result = {
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

/**
 * @param {URL} url
 * @param {ServerResponse} response
 */
async function handleModels(url, response) {
  const provider = url.searchParams.get("provider");

  if (provider !== "ollama") {
    sendJson(response, 200, { models: [] });
    return;
  }

  const baseUrl = url.searchParams.get("baseUrl") || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const models = await listOllamaModels(baseUrl);
  sendJson(response, 200, { models });
}

/**
 * @param {string} relativePath a path relative to the app root, with forward slashes
 * @returns {boolean}
 */
function isPublic(relativePath) {
  if (relativePath === "index.html") {
    return true;
  }

  return !relativePath.endsWith(".test.js") && publicFolders.some((folder) => relativePath.startsWith(folder));
}

/**
 * @param {ServerResponse} response
 * @param {URL} url
 * @param {boolean} [headOnly]
 */
function serveStatic(response, url, headOnly = false) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(appRoot, requestedPath));
  const relativePath = relative(appRoot, filePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    sendError(response, 403, "Forbidden");
    return;
  }

  if (!isPublic(relativePath.split(sep).join("/")) || !existsSync(filePath) || !statSync(filePath).isFile()) {
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
  })().catch((/** @type {unknown} */ error) => {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    sendError(response, 500, "Request failed", message);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Queloucura API listening on http://127.0.0.1:${port}`);
});
