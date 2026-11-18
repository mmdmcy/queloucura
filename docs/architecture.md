# Architecture

The app is a local JavaScript web tool with a small API server and a browser client, plain ES modules with no third-party dependencies and no build step.

## Runtime

- `src/server/server.js` exposes local API routes on `127.0.0.1:8787` and serves `index.html` and the `src/client/`, `src/core/` and `src/shared/` modules to the browser as they are.
- `src/client/main.js` renders the browser UI and keeps transcripts in memory.
- `src/shared/types.js` holds the shared JSDoc types.
- `src/core/harnessProfiles.js` defines simulated harness profiles.
- `src/core/probes.js` defines repeatable prompts for known failure modes.
- `src/core/metrics.js` contains deterministic diagnostics and stats helpers.
- `src/providers/` contains provider adapters for Ollama and OpenAI-compatible APIs.

## Data Flow

1. The browser sends a prompt, provider config, harness profile, and stress settings to `/api/chat`.
2. The server builds the system prompt from the selected profile.
3. The selected provider adapter sends the chat request to Ollama or a `/v1/chat/completions` endpoint.
4. The server calculates metrics and markdown diagnostics.
5. The browser renders the response, stats, and comparison rows.

## Privacy Shape

The server does not write transcripts, provider responses, uploads, or API keys to disk. API keys entered in the UI are sent only to the local API server for the current request. Public repo hygiene is enforced through `.gitignore`; private notes, local env files, state, logs, uploads, and `AGENTS.md` are ignored.
