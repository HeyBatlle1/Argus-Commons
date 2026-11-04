# Running Argus-Commons on a machine with no GPU

## 8 GB RAM? Use hosted mode, and skip Ollama entirely

With 8 GB, a local model plus Docker plus the desktop won't fit. Gemma 4 E4B
alone wants about 8 GB. Run **every** model on OpenRouter instead. It's still
open weights only, and the verifier still enforces that. The stack then uses
about 2.5 GB, mostly Chromium.

```bash
# Linux Mint / Ubuntu prerequisites
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev git curl python3 gnome-keyring
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source ~/.cargo/env
# Docker Engine + compose plugin (Mint is Ubuntu-based; use the "noble" repo on Mint 22)
sudo apt install -y docker.io docker-compose-v2 && sudo usermod -aG docker $USER   # log out & back in

git clone https://github.com/HeyBatlle1/Argus-Commons.git && cd Argus-Commons
cargo build --release -j2          # -j2 keeps an 8 GB box from swapping to death; ~20–40 min first time
./target/release/argus vault set openrouter_api_key sk-or-...
ARGUS_OLLAMA=hosted ./argus-up.sh  # first run also builds the Docker images: ~30–60 min, ~15 GB disk
```

Open <http://localhost:3000>. In hosted mode:

| What | Model | Rough cost |
|---|---|---|
| Solo Argus + background chores | `open/deepseek-v4.1-flash` | ~$0.05 / M input tokens |
| Commons seats | DeepSeek, GLM, Kimi, Mistral, MiMo | cents per long session |
| Memory embeddings (Supabase only) | `open/bge-base-embed` (768-d) | ~$0.005 / M tokens |

Set a spend limit on your OpenRouter key at openrouter.ai/settings/keys.
Ambient Commons rounds are the main thing that burns tokens.

**8 GB tips:** close the browser tabs you don't need while building. If
`cargo` gets killed (OOM), add swap first:
`sudo fallocate -l 4G /swapfile2 && sudo chmod 600 /swapfile2 && sudo mkswap /swapfile2 && sudo swapon /swapfile2`.

The rest of this guide is for running a model **locally** on CPU (16 GB+).

---

Everything runs locally. The default model is **Gemma 4 E4B** (`gemma4:e4b`):
about 4B effective parameters, a 6.6 GB download, and roughly 8 GB of RAM while
it's loaded. It supports tool calling, so Argus can use its tools.

## What to expect on CPU

- **RAM:** 16 GB total is comfortable. Gemma takes about 8 GB, and the rest of
  the stack (daemon, browser, workspace, LiteLLM, frontend) takes about 3–4 GB.
  With 8 GB total it will swap and crawl.
- **Speed:** roughly 5–15 tokens/second on a modern 8-core CPU, so expect a
  short answer in 10–40 s. The first message after a restart is slower while
  the model loads.
- **The Commons:** seats take turns, so 3 local seats is 3× the wait.
  `infra/roster.cpu.json` seats three agents, not five. Keep ambient mode off,
  or set `ARGUS_AMBIENT_MAX_ROUNDS=2`.
- **Hybrid option:** if you add an OpenRouter key, the default five-seat roster
  runs on hosted open-weight models, which are fast, while solo Argus stays on
  local Gemma. That's the best experience on a CPU box.

---

## 1. Install Ollama

**Linux**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```
This installs a systemd service that starts automatically. Check it with
`systemctl status ollama`.

**Windows:** install from <https://ollama.com/download/windows>. Argus's
launcher is a bash script, so run the rest of this guide inside **WSL2**
(Ubuntu) with **Docker Desktop** using the WSL2 backend.

**macOS (Intel, no GPU):** install the app from <https://ollama.com/download/mac>
and open it once so it's running in the menu bar.

## 2. Pull the models

```bash
ollama pull gemma4:e4b
ollama pull nomic-embed-text
```
`nomic-embed-text` (274 MB) powers semantic memory.

## 3. Confirm tool support and speed

```bash
ollama show gemma4:e4b
```
`Capabilities` must list **tools**. If it doesn't, Argus can chat but can't use
any tools. In that case, use `qwen3:4b` instead (it has tools) and set
`ARGUS_DEFAULT_MODEL=local/qwen3-4b` after adding it to `infra/litellm/config.yaml`.

```bash
ollama run gemma4:e4b --verbose "Say hi in five words."
```
The `eval rate` line is your tokens/second.

## 4. Let Docker reach your Ollama

The LiteLLM container talks to Ollama at `host.docker.internal:11434`.

- **macOS / Windows (Docker Desktop):** works out of the box.
- **Linux:** Ollama listens on `127.0.0.1` by default, which containers can't
  reach. Make it listen on all interfaces:
  ```bash
  sudo systemctl edit ollama
  ```
  Add:
  ```
  [Service]
  Environment="OLLAMA_HOST=0.0.0.0:11434"
  Environment="OLLAMA_NUM_PARALLEL=1"
  Environment="OLLAMA_CONTEXT_LENGTH=8192"
  Environment="OLLAMA_KEEP_ALIVE=30m"
  ```
  Then run `sudo systemctl restart ollama`, and **block port 11434 from your LAN**
  (`sudo ufw deny 11434` or the firewall you use), because Ollama has no auth.

  *Alternative on Linux:* skip the native install and let Docker run Ollama
  (`ARGUS_OLLAMA=container`). It's already isolated on an internal network, and
  the first launch pulls the models for you.

## 5. Build and launch Argus

```bash
git clone https://github.com/HeyBatlle1/Argus-Commons.git && cd Argus-Commons
cargo build --release
```

Then launch, either local-only (no key):
```bash
ARGUS_OLLAMA=native ARGUS_ROSTER_FILE=/argus/infra/roster.cpu.json ./argus-up.sh
```

Or hybrid (local solo Argus + hosted open-weight Commons):
```bash
./target/release/argus vault set openrouter_api_key YOUR_KEY
ARGUS_OLLAMA=native ./argus-up.sh
```

Open <http://localhost:3000>.

`ARGUS_OLLAMA=native` uses the Ollama you installed in step 1. Use
`ARGUS_OLLAMA=container` to have Docker run it instead.

## 6. Check it's alive

```bash
curl -s -H "Authorization: Bearer $(./target/release/argus vault get llm_api_key)" \
  http://localhost:4000/v1/models | head
docker compose logs -f argus-daemon
```
The first log lines show `Model gateway: … (default model: local/gemma4-e4b)`.

## Knobs

| Env var | Default | What it does |
|---|---|---|
| `ARGUS_DEFAULT_MODEL` | `local/gemma4-e4b` | Solo Argus engine |
| `ARGUS_REFLECT_MODEL` | same as default | Background skill reflection and summaries. Same model, so nothing extra loads |
| `ARGUS_ROSTER_FILE` | built-in 5 hosted seats | Who sits in the Commons |
| `ARGUS_AMBIENT_MAX_ROUNDS` | `4` | Cap for ambient chatter |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | Argus's system prompt plus tools is ~4k tokens; don't go below 8192 |
| `OLLAMA_MODELS_TO_PULL` | `gemma4:e4b nomic-embed-text` | What the launcher pulls |

**Troubleshooting**
- *Replies time out:* LiteLLM allows 300 s per request. If you're hitting that,
  you're swapping. Close other apps or drop to `gemma4:e2b` (4.6 GB).
- *"model not found":* run `ollama list`. The tag must be exactly `gemma4:e4b`.
- *LiteLLM can't reach Ollama on Linux:* see step 4. `OLLAMA_HOST` must be `0.0.0.0`.
