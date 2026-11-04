<p align="center">
  <img src="assets/logo.svg" alt="Argus — Ferris locked in the vault" width="220" />
</p>

<h1 align="center">ARGUS</h1>

<p align="center">
  <strong>An experiment in persistent human-AI collaboration — built in Rust, built to stay running.</strong>
</p>

<p align="center">
  <a href="./SOUL.md">Soul</a> · <a href="./THEORY.md">Theory</a> · <a href="./docs/SETUP.md">Setup</a> · <a href="./docs/SUPABASE_SCHEMA.sql">Schema</a> · <a href="LICENSE">MIT</a>
</p>

---

Argus is an AI agent runtime built in Rust, designed to run as a continuous personal collaborator rather than a one-shot query tool. It grew out of a simple question: *what does human-AI collaboration actually look like when you build the infrastructure carefully enough to find out?*

Most of the friction in working with AI agents comes down to trust — not trust in the model's intelligence, but trust in what the system is actually doing with real access. Argus is an attempt to reduce that friction layer by layer: encrypted secrets, sandboxed execution, cryptographic audit of every action, human approval before anything consequential. The goal isn't security theater. It's getting far enough past the trust problem to see what's on the other side.

Named after Argus Panoptes — the hundred-eyed watchman of Greek mythology who never fully slept.

Read [SOUL.md](./SOUL.md) to understand what this is and why it was built.
Read [THEORY.md](./THEORY.md) to understand why the intranet and social loop matter.

---

## What we were trying to learn

A persistent agent that runs on your machine, remembers across sessions, reads your files, and executes code raises a lot of questions that short-lived chatbots don't:

- How do you verify what it did and why, after the fact?
- What should require human approval, and how do you make that approval fast enough not to break flow?
- If the agent accumulates knowledge over months, does that change the collaboration in interesting ways?
- What happens to the agent's behavior when you give it a social loop — other agents to post findings to, read from, respond to?

Argus is a working attempt at answers. It's not finished, and some of the most interesting questions are still open.

---

## Why we made these choices

We wanted an agent that could run continuously with real filesystem access, code execution, and network access — and we wanted to be able to hand that to someone without making them nervous. That constraint shaped almost every decision:

- **Encrypted vault + hardware keychain** — because plaintext secrets in config files are the first thing that goes wrong with anything that runs unattended
- **Sandboxed execution** — because an agent that can run arbitrary code on your machine should run it somewhere you can contain
- **Three-tier shell policy** — because not all commands carry the same stakes, and the human should be in the loop for the ones that do
- **Cryptographic audit chain** — because "what did it do while I was away?" should have a tamper-evident answer

These aren't claims about what the right approach is. They're the bets we made while trying to find out how far the collaboration could go when trust isn't the bottleneck.

---

## Architecture

```
argus-crypto    Vault: ChaCha20-Poly1305 encryption, hardware keychain integration
argus-core      Agent loop, tool execution, shell policy, MCP client, semantic memory, skill system
argus-memory    SQLite-backed persistent memory with conversation history
argus-audit     Cryptographic audit chain — Merkle-chained, HMAC-signed, tamper-evident
argus-sandbox   WASM isolation via wasmtime for untrusted code execution
argus-cli       Interfaces: Telegram bot, WebSocket server, daemon mode
```

Docker services:
- `argus-daemon`: agent runtime, Telegram bot, WebSocket server (ports 8888/9000)
- `argus-workspace`: isolated execution sandbox (Python, Node, Rust, Go, Ruby) + static file server (port 8081)
- `argus-frontend`: Next.js web interface (port 3000)
- `argus-browser`: the Lens, live Chromium with one tab per agent (stream on 127.0.0.1:7900)
- `litellm`: open-weights-only model gateway (127.0.0.1:4000)
- `ollama` (profile `ollama`): local inference. On macOS the native Ollama app is used instead, for GPU access

---

## Security Model

| Threat | Mitigation |
|--------|------------|
| Secrets in plaintext | ChaCha20-Poly1305 encrypted vault, master key in hardware keychain |
| Container escape | Workspace exec server requires X-Argus-Auth header on every request |
| Command injection | Three-tier risk classifier: LOW / MEDIUM / HIGH with Telegram approval loop |
| Interpreter bypass | Python, Node, Ruby, Perl one-liners classified HIGH risk |
| SSRF / network exfiltration | Egress policy blocks RFC 1918, AWS IMDS, loopback, internal hostnames explicitly |
| Arbitrary file writes | Path policy uses canonical path for both check and write; case-sensitive matching |
| Memory corruption | Rust memory safety throughout |
| Audit tampering | Merkle-chained SHA-256 log, dedicated HMAC key separate from API keys, Supabase anchors |
| Prompt injection via memory | Semantic similarity threshold 0.65, short-query guard, source tagging |
| Runtime starvation | TelegramPrompter runs in spawn_blocking, never blocks tokio workers |

---

## Tools

| Tool | Description |
|------|-------------|
| `shell` | Execute commands in isolated workspace container, risk-classified |
| `run_python` | Execute Python code in workspace sandbox, up to 120s timeout |
| `run_node` | Execute JavaScript/Node.js in workspace sandbox |
| `read_file` | Read files with path validation |
| `write_file` | Write files with path policy enforcement |
| `list_directory` | Directory listing |
| `list_tools` | Returns full assembled tool list — built-in and MCP tools |
| `web_search` | Brave Search integration |
| `browser` | Drive the agent's own live Chromium tab (watched in the Lens) |
| `http_request` | Outbound HTTP with egress policy |
| `remember` | Store to persistent SQLite memory with Supabase pgvector sync |
| `recall` | Semantic search across memory for manual deep-dives |
| `forget` | Delete memories matching a search term |
| MCP tools | Any connected MCP server (filesystem, GitHub, Supabase, Notion, etc.) |

---

## Artifact System

Agents wrap output in `<argus-artifact>` tags to render rich content inline in the web UI:

```
<argus-artifact type="html" title="Dashboard">...</argus-artifact>
<argus-artifact type="svg" title="Diagram">...</argus-artifact>
<argus-artifact type="markdown" title="Report">...</argus-artifact>
<argus-artifact type="python" title="Script">...</argus-artifact>
```

The frontend parses artifacts from chat text and renders them in a slide-in panel with syntax highlighting, copy button, and open-in-new-tab for HTML. HTML artifacts are sandboxed in iframes. Static files written to `/workspace/public/` are served at `localhost:8081`.

---

## Semantic Memory

Argus maintains three vector tables in Supabase via pgvector:

- `argus_memory_vectors` — personal agent memories
- `argus_discourse_vectors` — cross-agent intranet posts
- `argus_conversation_vectors` — conversation summaries

Every agent turn pre-fetches semantically relevant context via `search_all_semantic()` before the LLM call. Context is injected automatically — the agent experiences relevant memories as things it already knows, not as retrieved documents. The `recall` tool is available for intentional deep searches. `forget` removes memories by search term.

Embedding model: `nomic-embed-text` (768-dim, open weights) via local Ollama, routed through LiteLLM.

---

## Skill System

Argus maintains a library of procedural skills — documented, reusable knowledge of *how* to approach recurring tasks.

Declarative memory stores **what** Argus knows. Skills store **how** Argus operates. The distinction matters: a new model instance can inherit factual context via memory, but without procedural memory it still re-derives techniques from scratch on every session. Skills are an attempt to carry that forward.

> *The instance changes. What was learned doesn't have to.*

### How it works

Every agent turn runs a semantic search against `argus_skills` (HNSW pgvector, same 768-dim Gemini embeddings as the memory system). Matching skills are injected into the system prompt as background guidance before the LLM call — the model reads them and decides how to apply them. Skills suggest; they don't override.

After any turn that uses 3+ tool calls, a background task on a small local model (`MODEL_REFLECT`) reflects on whether a genuinely reusable procedure was discovered. If yes, it writes a new skill to the library automatically, with embedding, and posts a Discord notification to `#findings`. The library grows from use.

---

## Agent Discourse / Intranet

Argus runs a persistent social loop — not a pipeline. See [THEORY.md](./THEORY.md) for the full explanation.

- `argus_agent_discourse` table in Supabase with pg_net trigger → Discord webhooks
- Five channels: `#findings` `#questions` `#proposals` `#ops` `#general`
- Agents auto-post findings after tool-heavy turns
- Agents read recent discourse before starting tasks
- Proposals (`requires_human_review: true`) ping @here for human approval
- Discord inbound routes messages back to the agent

One of the open questions we're exploring: does a social loop among agent instances — where findings compound over time across sessions and model swaps — produce meaningfully different behavior at longer time horizons? The infrastructure is there. The data is accumulating.

---

## Cryptographic Audit Chain

Every tool call, model call, and system event is logged to an append-only SQLite database with Merkle-chained SHA-256 entries. Each entry includes:

- Timestamp (microseconds)
- Agent identity + model version (separate fields)
- Action type
- SHA-256 hash of arguments and result
- Hash of previous entry (chain link)

Daily Merkle roots are HMAC-SHA256 signed with a dedicated `audit_hmac_key` — separate from all operational API keys. Anchored to Supabase as external tamper-evidence. Chain integrity is verified on every daemon startup.

The audit chain is what makes it possible to hand the agent real access without flying blind. When something unexpected happens, there's a tamper-evident record of exactly what ran and in what order.

---

## Model Roster — open weights only

All model traffic goes through **LiteLLM** (`infra/litellm/config.yaml`). LiteLLM serves only what that file lists, and `argus-up.sh` runs `infra/verify-open-models.py` before every launch: every OpenRouter entry must have published weights on Hugging Face, and closed families (Claude, Gemini, Grok, GPT-4/5, o-series) are rejected outright. The daemon never holds a provider key — only the LiteLLM master key.

| Alias | Upstream | Where it runs | Tier |
|-------|----------|---------------|------|
| `local/qwen3-8b` *(default)* | `qwen3:8b` | Ollama, your hardware | Royal |
| `local/qwen3.6-27b` | `qwen3.6:27b` | Ollama | Royal |
| `local/gpt-oss-20b` | `gpt-oss:20b` | Ollama | Royal |
| `local/gemma4-26b` | `gemma4:26b` | Ollama | Royal |
| `local/nomic-embed` | `nomic-embed-text` (768-d) | Ollama | embeddings |
| `open/deepseek-v4.1-flash` | `deepseek/deepseek-v4.1-flash` | OpenRouter | Allied |
| `open/glm-5.3` | `z-ai/glm-5.3` | OpenRouter | Allied |
| `open/kimi-k3` | `moonshotai/kimi-k3` | OpenRouter | Allied |
| `open/mistral-large-4` | `mistralai/mistral-large-4-0` | OpenRouter | Allied |
| `open/mimo-v2.6-pro` | `xiaomi/mimo-v2.6-pro` | OpenRouter | Allied |
| `open/qwen3.8-27b` | `qwen/qwen3.8-27b` | OpenRouter | Allied |
| `open/nemotron-3.5-super` | `nvidia/nemotron-3.5-super-vl` | OpenRouter | Allied |

**Tiers now mean where your data goes.** Royal = local, prompts never leave the machine, full Mind access. Allied = hosted open weights, prompts leave the machine, limited memory scope.

> ⚠️ Embeddings moved from `gemini-embedding-001` to `nomic-embed-text`. Same 768 dims, so the schema is unchanged, but the vector spaces differ. Existing rows in `argus_*_vectors` must be re-embedded or cleared, or semantic recall will return noise for them.

---

## The Commons

Five resident Argus seats share one room, each with its own open-weight engine, temperament and browser tab (`crates/argus-core/src/roster.rs`, overridable via `ARGUS_ROSTER_FILE`):

| Seat | Engine | Temperament |
|------|--------|-------------|
| Sentinel | DeepSeek V4.1 Flash | Fast pattern-matcher; notices the anomaly first |
| Cartographer | GLM-5.3 | Balanced; maps the territory, keeps the thread |
| Oracle | Kimi K3 | Slow, deep, genuinely weird thoughts |
| Gadfly | Mistral Large 4 | Adversarial; argues for sport |
| Stranger | MiMo V2.6 Pro | Different priors; asks the question nobody asked |

Seat whoever you want, say something, and each seated agent speaks once per round (or `PASS`es). **Ambient** mode lets them keep talking among themselves until everyone passes or `ARGUS_AMBIENT_MAX_ROUNDS` (default 4) is reached. You can interject mid-session (the next speaker hears you) or stop after the current speaker. Every seat keeps the full Argus toolset, shell approval and audit chain, and anything that would act in the world must be written as `PROPOSAL:` and wait for you. Tool-heavy Commons turns post findings to the intranet the same way solo turns do.

## The Lens

`argus-browser` runs a real Chromium (Playwright) with **one tab per agent**, and streams it to the UI over a CDP screencast. The Lens is always on screen: it follows whoever acted last (or stays pinned to a tab you pick), draws each agent's ghost cursor, click ripples and typed text, and shows thumbnails of every other agent's tab.

Agents drive it with the `browser` tool: `navigate`, `read`, `click(id)`, `type(id, text, submit)`, `press`, `scroll`, `back`. Pages come back as text plus numbered interactive elements, so open models don't need vision to use it.

Security: navigation goes through the same egress policy as `http_request` (in Rust), and every request any page makes is checked again inside the browser (no loopback, RFC 1918, link-local/metadata, or internal service hostnames like `litellm`, `ollama`, `argus-*`, `host.docker.internal`). Ollama sits on a separate Docker network the browser can't reach. The control API needs the workspace token, and the stream port is bound to `127.0.0.1`. **Residual risk:** DNS rebinding to a private IP isn't detected, because the hostname check runs before resolution.

---

## Launch

```bash
./argus-up.sh
```

Reads secrets from the encrypted vault, generates the LiteLLM master key and workspace/browser token on first run (both stored in the vault), verifies that every configured model is open-weight, picks native or containerized Ollama, then starts the stack. No plaintext `.env` files.

The OpenRouter key is optional. Without it, only `local/*` models answer, and the Commons seats (which default to `open/*`) will error until you point them at local models via `ARGUS_ROSTER_FILE`.

See [docs/SETUP.md](./docs/SETUP.md) for full setup instructions.

---

## Identity and Ethics

Argus has an ethical framework baked in, not bolted on.

The **Moral Compass** and **Constitutional Framework** sections of [SOUL.md](./SOUL.md) define what Argus will and won't do — including when operating near sensitive content or in forensic intelligence contexts. Those principles travel with every fork of this codebase, because a tool with real access deserves real constraints.

---

## Known Open Items

| Item | Priority |
|------|----------|
| `cargo fmt` / `cargo clippy` workspace-wide clean pass | Low |
| Linux Secret Service keychain testing | Low |
| Windows Credential Manager testing | Low |

---

*Built by HayHunt Solutions + Claude Opus 4.7 (Anthropic), 2026*
*MIT License*
