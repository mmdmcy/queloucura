# Product Vision

Queloucura exists to make product-harness failure modes visible. The initial focus is not to prove why a specific commercial assistant behaves badly, because proprietary prompts and routing are unavailable. The focus is to reproduce the kinds of pressure a productivity assistant may face and measure how model behavior changes.

## Goals

- Compare the same prompt across minimal and overconstrained harness profiles.
- Make formatting, artifact, citation, and tool-access failures easy to spot.
- Support local models through Ollama and cloud or self-hosted OpenAI-compatible APIs.
- Keep experiments reproducible without storing private transcripts in the repo.

## Non-Goals

- Cloning any proprietary system prompt.
- Using third-party branding, assets, or private endpoint behavior.
- Claiming automated truth detection. The diagnostics are signals that still need human review.
- Persisting user transcripts by default.

## Useful Questions

- Does extra citation or artifact pressure increase unsupported claims?
- Does a model invent sandbox or file-system actions when the UI implies tool access?
- Which failures are model-specific, and which are harness-profile-specific?
- Can clearer system prompts reduce broken markdown and fake downloads?
