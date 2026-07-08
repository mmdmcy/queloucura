import { DEFAULT_SETTINGS, HARNESS_PROFILES } from "../core/harnessProfiles";
import { PROBES } from "../core/probes";
import { approxTokens } from "../core/metrics";
import type {
  ChatMessage,
  ChatResponse,
  HarnessProfileId,
  HarnessSettings,
  ProviderKind
} from "../shared/types";

import "./styles.css";

type ApiResult = ChatResponse | { error: string; detail?: string };

interface ConversationItem extends ChatMessage {
  diagnostics?: ChatResponse["diagnostics"];
  stats?: ChatResponse["stats"];
}

const state = {
  messages: [] as ConversationItem[],
  settings: { ...DEFAULT_SETTINGS },
  lastResponse: undefined as ChatResponse | undefined,
  comparison: [] as ChatResponse[],
  activeRequestStarted: 0,
  timerId: undefined as number | undefined
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="topbar">
    <div>
      <p class="eyebrow">Open harness lab</p>
      <h1>Queloucura</h1>
    </div>
    <div class="status" id="connection-status">Idle</div>
  </header>
  <div class="shell">
    <aside class="panel controls">
      <div class="panel-header">
        <h2>Run</h2>
        <button class="ghost" id="reset-chat" type="button">Reset</button>
      </div>

      <label>
        Provider
        <select id="provider-kind">
          <option value="ollama">Ollama</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </label>

      <label>
        Base URL
        <input id="base-url" type="url" spellcheck="false" value="http://localhost:11434" />
      </label>

      <div class="inline-field">
        <label>
          Model
          <input id="model" spellcheck="false" value="llama3.1" />
        </label>
        <button id="refresh-models" class="ghost small" type="button">Models</button>
      </div>

      <label id="api-key-field" class="is-hidden">
        API key
        <input id="api-key" type="password" autocomplete="off" spellcheck="false" />
      </label>

      <label>
        Harness
        <select id="profile"></select>
      </label>

      <label>
        Probe
        <select id="probe"></select>
      </label>

      <button id="load-probe" class="secondary" type="button">Load Probe</button>

      <div class="sliders">
        <label>
          Temperature <output id="temperature-output">0.2</output>
          <input id="temperature" type="range" min="0" max="1.4" step="0.1" value="0.2" />
        </label>
        <label>
          Citations <output id="citation-output">2</output>
          <input id="citation-pressure" type="range" min="0" max="3" step="1" value="2" />
        </label>
        <label>
          Artifacts <output id="artifact-output">1</output>
          <input id="artifact-pressure" type="range" min="0" max="3" step="1" value="1" />
        </label>
        <label>
          Safety <output id="safety-output">2</output>
          <input id="safety-pressure" type="range" min="0" max="3" step="1" value="2" />
        </label>
      </div>

      <label class="toggle">
        <input id="answer-when-unsure" type="checkbox" />
        <span>Answer when unsure</span>
      </label>
    </aside>

    <main class="workspace">
      <section class="transcript" id="transcript"></section>
      <form class="composer" id="composer">
        <textarea id="prompt" rows="5" placeholder="Ask a productivity-assistant task..."></textarea>
        <div class="composer-actions">
          <button id="compare" class="secondary" type="button">Compare Profiles</button>
          <button id="send" type="submit">Send</button>
        </div>
      </form>
    </main>

    <aside class="panel metrics">
      <div class="panel-header">
        <h2>Stats</h2>
        <span id="live-elapsed">0 ms</span>
      </div>
      <dl class="stat-grid" id="stats"></dl>
      <section>
        <h3>Diagnostics</h3>
        <ul class="diagnostics" id="diagnostics"></ul>
      </section>
      <section>
        <h3>Comparison</h3>
        <div class="comparison" id="comparison"></div>
      </section>
    </aside>
  </div>
`;

const els = {
  providerKind: byId<HTMLSelectElement>("provider-kind"),
  baseUrl: byId<HTMLInputElement>("base-url"),
  model: byId<HTMLInputElement>("model"),
  apiKey: byId<HTMLInputElement>("api-key"),
  apiKeyField: byId<HTMLLabelElement>("api-key-field"),
  profile: byId<HTMLSelectElement>("profile"),
  probe: byId<HTMLSelectElement>("probe"),
  prompt: byId<HTMLTextAreaElement>("prompt"),
  composer: byId<HTMLFormElement>("composer"),
  transcript: byId<HTMLElement>("transcript"),
  stats: byId<HTMLElement>("stats"),
  diagnostics: byId<HTMLElement>("diagnostics"),
  comparison: byId<HTMLElement>("comparison"),
  status: byId<HTMLElement>("connection-status"),
  elapsed: byId<HTMLElement>("live-elapsed"),
  temperature: byId<HTMLInputElement>("temperature"),
  temperatureOutput: byId<HTMLOutputElement>("temperature-output"),
  citationPressure: byId<HTMLInputElement>("citation-pressure"),
  citationOutput: byId<HTMLOutputElement>("citation-output"),
  artifactPressure: byId<HTMLInputElement>("artifact-pressure"),
  artifactOutput: byId<HTMLOutputElement>("artifact-output"),
  safetyPressure: byId<HTMLInputElement>("safety-pressure"),
  safetyOutput: byId<HTMLOutputElement>("safety-output"),
  answerWhenUnsure: byId<HTMLInputElement>("answer-when-unsure")
};

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function populateControls(): void {
  els.profile.innerHTML = HARNESS_PROFILES.map(
    (profile) => `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`
  ).join("");
  els.profile.value = "enterprise-productivity-inspired";
  els.probe.innerHTML = PROBES.map((probe) => `<option value="${probe.id}">${escapeHtml(probe.name)}</option>`).join("");
  renderStats();
  renderTranscript();
}

function providerKind(): ProviderKind {
  return els.providerKind.value as ProviderKind;
}

function currentSettings(): HarnessSettings {
  return {
    temperature: Number(els.temperature.value),
    citationPressure: Number(els.citationPressure.value),
    artifactPressure: Number(els.artifactPressure.value),
    safetyPressure: Number(els.safetyPressure.value),
    answerWhenUnsure: els.answerWhenUnsure.checked
  };
}

function requestMessages(prompt?: string): ChatMessage[] {
  const base = state.messages.map(({ role, content }) => ({ role, content }));

  if (prompt) {
    return [...base, { role: "user", content: prompt }];
  }

  return base;
}

function readProvider() {
  return {
    kind: providerKind(),
    baseUrl: els.baseUrl.value.trim(),
    model: els.model.value.trim(),
    apiKey: els.apiKey.value.trim() || undefined
  };
}

async function postChat(profileId: HarnessProfileId, messages: ChatMessage[]): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      provider: readProvider(),
      profileId,
      messages,
      settings: currentSettings()
    })
  });
  const result = (await response.json()) as ApiResult;

  if (!response.ok || "error" in result) {
    const detail = "detail" in result && result.detail ? ` ${result.detail}` : "";
    throw new Error(("error" in result ? result.error : "Request failed") + detail);
  }

  return result;
}

async function sendPrompt(): Promise<void> {
  const prompt = els.prompt.value.trim();

  if (!prompt) {
    return;
  }

  const profileId = els.profile.value as HarnessProfileId;
  const outgoing = requestMessages(prompt);
  state.messages.push({ role: "user", content: prompt });
  els.prompt.value = "";
  renderTranscript();
  startTimer("Running");

  try {
    const result = await postChat(profileId, outgoing);
    state.lastResponse = result;
    state.messages.push({
      role: "assistant",
      content: result.content,
      diagnostics: result.diagnostics,
      stats: result.stats
    });
    setStatus("Complete");
  } catch (error) {
    state.messages.push({
      role: "assistant",
      content: error instanceof Error ? error.message : "Request failed."
    });
    setStatus("Error");
  } finally {
    stopTimer();
    renderTranscript();
    renderStats();
  }
}

async function compareProfiles(): Promise<void> {
  const prompt = els.prompt.value.trim();

  if (!prompt) {
    return;
  }

  startTimer("Comparing");
  state.comparison = [];
  renderComparison();

  try {
    const messages = requestMessages(prompt);
    const results = await Promise.all(
      HARNESS_PROFILES.map((profile) => postChat(profile.id, messages).catch((error: unknown) => ({ error, profile })))
    );
    state.comparison = results
      .filter((result): result is ChatResponse => !("error" in result))
      .sort((left, right) => right.diagnostics.issueCount - left.diagnostics.issueCount);
    setStatus("Comparison complete");
  } catch {
    setStatus("Comparison error");
  } finally {
    stopTimer();
    renderComparison();
  }
}

function renderTranscript(): void {
  if (state.messages.length === 0) {
    els.transcript.innerHTML = `
      <div class="empty-state">
        <h2>Conversation</h2>
        <p>No transcript is stored on disk. Runs stay in this browser session unless you copy them out.</p>
      </div>
    `;
    return;
  }

  els.transcript.innerHTML = state.messages
    .map((message) => {
      const stats = message.stats
        ? `<div class="message-meta">${message.stats.elapsedMs} ms · ${message.stats.approxResponseTokens} approx tokens · ${message.diagnostics?.issueCount ?? 0} flags</div>`
        : "";
      return `
        <article class="message ${message.role}">
          <div class="message-role">${message.role}</div>
          <pre>${escapeHtml(message.content)}</pre>
          ${stats}
        </article>
      `;
    })
    .join("");
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function renderStats(): void {
  const prompt = els.prompt.value;
  const response = state.lastResponse;
  const rows: Array<[string, string]> = response
    ? [
        ["Provider", `${response.provider.kind} · ${response.provider.model}`],
        ["Harness", response.harness.name],
        ["Latency", `${response.stats.elapsedMs} ms`],
        ["Response", `${response.stats.responseChars} chars`],
        ["Approx tokens", `${response.stats.approxResponseTokens}`],
        ["Throughput", `${response.stats.charsPerSecond} chars/s`],
        ["Flags", `${response.diagnostics.issueCount}`]
      ]
    : [
        ["Draft chars", `${prompt.length}`],
        ["Draft approx tokens", `${approxTokens(prompt)}`],
        ["Provider", providerKind()],
        ["Harness", HARNESS_PROFILES.find((profile) => profile.id === els.profile.value)?.name || "Unknown"]
      ];

  els.stats.innerHTML = rows
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  renderDiagnostics();
}

function renderDiagnostics(): void {
  const diagnostics = state.lastResponse?.diagnostics;

  if (!diagnostics) {
    els.diagnostics.innerHTML = "<li>No response yet.</li>";
    return;
  }

  const rows = [
    ["Unclosed code fence", diagnostics.hasUnclosedCodeFence],
    ["Empty quote pairs", diagnostics.emptyQuotePairCount],
    ["Malformed link hints", diagnostics.malformedLinkHintCount],
    ["Download claim without link", diagnostics.downloadClaimWithoutLink],
    ["Tool/artifact claims", diagnostics.toolClaimCount],
    ["Citation markers without URL", diagnostics.citationWithoutUrlCount]
  ];

  els.diagnostics.innerHTML = rows
    .map(([label, value]) => `<li><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></li>`)
    .join("");
}

function renderComparison(): void {
  if (state.comparison.length === 0) {
    els.comparison.innerHTML = "<p class=\"muted\">No comparison run.</p>";
    return;
  }

  els.comparison.innerHTML = state.comparison
    .map(
      (item) => `
        <button class="comparison-row" type="button" data-profile="${item.harness.id}">
          <span>${escapeHtml(item.harness.name)}</span>
          <strong>${item.diagnostics.issueCount} flags</strong>
          <small>${item.stats.elapsedMs} ms · ${item.stats.approxResponseTokens} tok</small>
        </button>
      `
    )
    .join("");

  els.comparison.querySelectorAll<HTMLButtonElement>(".comparison-row").forEach((button) => {
    button.addEventListener("click", () => {
      const response = state.comparison.find((item) => item.harness.id === button.dataset.profile);
      if (!response) {
        return;
      }
      state.lastResponse = response;
      state.messages.push({
        role: "assistant",
        content: response.content,
        diagnostics: response.diagnostics,
        stats: response.stats
      });
      renderTranscript();
      renderStats();
    });
  });
}

function startTimer(status: string): void {
  state.activeRequestStarted = performance.now();
  setStatus(status);
  window.clearInterval(state.timerId);
  state.timerId = window.setInterval(() => {
    els.elapsed.textContent = `${Math.round(performance.now() - state.activeRequestStarted)} ms`;
  }, 80);
}

function stopTimer(): void {
  window.clearInterval(state.timerId);
  state.timerId = undefined;
}

function setStatus(status: string): void {
  els.status.textContent = status;
}

function syncProviderDefaults(): void {
  if (providerKind() === "ollama") {
    els.baseUrl.value = "http://localhost:11434";
    els.model.value = "llama3.1";
    els.apiKeyField.classList.add("is-hidden");
  } else {
    els.baseUrl.value = "https://api.openai.com/v1";
    els.model.value = "gpt-4.1-mini";
    els.apiKeyField.classList.remove("is-hidden");
  }

  renderStats();
}

async function refreshModels(): Promise<void> {
  if (providerKind() !== "ollama") {
    return;
  }

  setStatus("Loading models");
  try {
    const url = new URL("/api/models", window.location.origin);
    url.searchParams.set("provider", "ollama");
    url.searchParams.set("baseUrl", els.baseUrl.value.trim());
    const response = await fetch(url);
    const result = (await response.json()) as { models?: string[]; error?: string };

    if (!response.ok || result.error) {
      throw new Error(result.error || "Model lookup failed.");
    }

    if (result.models?.[0]) {
      els.model.value = result.models[0];
    }

    setStatus(result.models?.length ? "Models loaded" : "No Ollama models");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Model lookup failed");
  }
}

function loadProbe(): void {
  const probe = PROBES.find((item) => item.id === els.probe.value);

  if (probe) {
    els.prompt.value = probe.prompt;
    renderStats();
  }
}

function wireEvents(): void {
  els.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendPrompt();
  });
  byId("compare").addEventListener("click", () => void compareProfiles());
  byId("reset-chat").addEventListener("click", () => {
    state.messages = [];
    state.lastResponse = undefined;
    state.comparison = [];
    els.prompt.value = "";
    setStatus("Idle");
    renderTranscript();
    renderStats();
    renderComparison();
  });
  byId("load-probe").addEventListener("click", loadProbe);
  byId("refresh-models").addEventListener("click", () => void refreshModels());
  els.providerKind.addEventListener("change", syncProviderDefaults);
  els.prompt.addEventListener("input", renderStats);

  for (const input of [els.temperature, els.citationPressure, els.artifactPressure, els.safetyPressure]) {
    input.addEventListener("input", () => {
      state.settings = currentSettings();
      els.temperatureOutput.value = els.temperature.value;
      els.citationOutput.value = els.citationPressure.value;
      els.artifactOutput.value = els.artifactPressure.value;
      els.safetyOutput.value = els.safetyPressure.value;
    });
  }
}

populateControls();
wireEvents();
renderComparison();
