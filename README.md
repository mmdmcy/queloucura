# Queloucura

Queloucura is an open-source TypeScript app for experimenting with productivity chat harness behavior. It does not include or claim access to proprietary prompts, internal safety policies, office documents, private tenant data, or commercial toolchains. The goal is to model common product pressures, run the same prompt across harness profiles, and collect visible diagnostics when a model starts inventing files, citations, sandbox results, or broken markdown.

## What It Does

- Runs local chat experiments through Ollama or an OpenAI-compatible `/v1/chat/completions` API.
- Provides harness profiles that simulate different instruction pressures: direct baseline, enterprise productivity chat, overconstrained instructions, and artifact/download handling.
- Tracks latency, approximate token counts, response size, throughput, and provider usage when available.
- Flags common failure signals such as unclosed code fences, fabricated download claims, extra paired apostrophes, tool claims without evidence, and citation markers without URLs.
- Keeps transcripts in browser memory only. No database or server-side transcript log is created by default.

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:8787`.

For Ollama:

```bash
ollama serve
ollama pull llama3.1
```

For an OpenAI-compatible provider, set `OPENAI_API_KEY`, choose `OpenAI-compatible` in the UI, and set the model/base URL you want to test.

## Commands

```bash
npm run dev       # Client bundle watcher plus API/UI server
npm run test      # Node test runner
npm run typecheck # TypeScript checks
npm run build     # Production build
npm start         # Serve production build on 127.0.0.1:8787
npm run check     # Typecheck, test, and build
```

## Visibility

This repository is intended to be public. Keep private transcripts, tenant details, API keys, local hostnames, runtime state, uploaded files, and machine-specific notes out of source control. Use `.env` for local secrets and `.env.example` for sanitized defaults.

## Trademark Notice

This project is independent research tooling and is not affiliated with any third-party product, anime, game, or film franchise. Commercial product names may appear only when describing third-party systems being studied.
