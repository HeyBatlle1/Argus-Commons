#!/bin/bash
# Argus Docker launcher — pulls secrets from the vault (or macOS Keychain)
# No plaintext .env file ever needed.
#
# Model policy: open weights only. Local models via Ollama, open-weight hosted
# models via OpenRouter, all behind LiteLLM. infra/verify-open-models.py runs
# before every launch and refuses to start if a closed model sneaks in.
#
# Env knobs:
#   ARGUS_OLLAMA=native|container|none   (default: native on macOS, container elsewhere)
#   ARGUS_STRICT_OPEN=1                  fail if OpenRouter can't be reached to verify
#   OLLAMA_MODELS_TO_PULL="qwen3:8b nomic-embed-text"   (container mode)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="$SCRIPT_DIR/target/release/argus"

gen_secret() { python3 -c "import secrets;print('$1'+secrets.token_hex(24))"; }

echo "[*] Pulling secrets..."

# Strategy 1: Use vault binary if it exists (preferred)
if [ -f "$BINARY" ]; then
  export OPENROUTER_API_KEY=$("$BINARY" vault get openrouter_api_key 2>/dev/null || echo "")
  export TELEGRAM_BOT_TOKEN=$("$BINARY" vault get telegram_bot_token 2>/dev/null || echo "")
  export SUPABASE_ARGUS_URL=$("$BINARY" vault get supabase_argus_url 2>/dev/null || echo "")
  export SUPABASE_ARGUS_SERVICE_KEY=$("$BINARY" vault get supabase_argus_service_key 2>/dev/null || echo "")
  export TELEGRAM_CHAT_ID=$("$BINARY" vault get telegram_chat_id 2>/dev/null || echo "")
  export WORKSPACE_EXEC_TOKEN=$("$BINARY" vault get workspace_exec_token 2>/dev/null || echo "")
  export BRAVE_SEARCH_API_KEY=$("$BINARY" vault get brave_search_api_key 2>/dev/null || echo "")
  export LITELLM_MASTER_KEY=$("$BINARY" vault get llm_api_key 2>/dev/null || echo "")

  # First run: mint the internal secrets and persist them in the vault so the
  # daemon, workspace, browser and LiteLLM all agree on them.
  if [ -z "$LITELLM_MASTER_KEY" ]; then
    LITELLM_MASTER_KEY=$(gen_secret "sk-argus-")
    "$BINARY" vault set llm_api_key "$LITELLM_MASTER_KEY" >/dev/null
    echo "[+] Generated LiteLLM master key → vault:llm_api_key"
  fi
  if [ -z "$WORKSPACE_EXEC_TOKEN" ]; then
    WORKSPACE_EXEC_TOKEN=$(gen_secret "")
    "$BINARY" vault set workspace_exec_token "$WORKSPACE_EXEC_TOKEN" >/dev/null
    echo "[+] Generated workspace/browser token → vault:workspace_exec_token"
  fi
  export LITELLM_MASTER_KEY WORKSPACE_EXEC_TOKEN
  echo "[+] Loaded from vault binary"

# Strategy 2: macOS Keychain fallback (when binary not built)
elif command -v security &>/dev/null; then
  echo "[!] Vault binary not found — trying macOS Keychain..."
  kc() { security find-generic-password -a "argus" -s "$1" -w 2>/dev/null || echo ""; }
  kc_set() { security add-generic-password -U -a "argus" -s "$1" -w "$2" 2>/dev/null || true; }
  export OPENROUTER_API_KEY=$(kc openrouter_api_key)
  export TELEGRAM_BOT_TOKEN=$(kc telegram_bot_token)
  export LITELLM_MASTER_KEY=$(kc llm_api_key)
  export WORKSPACE_EXEC_TOKEN=$(kc workspace_exec_token)

  if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "[?] OpenRouter key (optional — only for open/* hosted models). Enter or leave blank:"
    read -rs OPENROUTER_API_KEY
    [ -n "$OPENROUTER_API_KEY" ] && kc_set openrouter_api_key "$OPENROUTER_API_KEY" && echo "[+] Saved to Keychain"
  fi
  if [ -z "$LITELLM_MASTER_KEY" ]; then
    LITELLM_MASTER_KEY=$(gen_secret "sk-argus-"); kc_set llm_api_key "$LITELLM_MASTER_KEY"
  fi
  if [ -z "$WORKSPACE_EXEC_TOKEN" ]; then
    WORKSPACE_EXEC_TOKEN=$(gen_secret ""); kc_set workspace_exec_token "$WORKSPACE_EXEC_TOKEN"
  fi
  export OPENROUTER_API_KEY LITELLM_MASTER_KEY WORKSPACE_EXEC_TOKEN
  export SUPABASE_ARGUS_URL=""
  export SUPABASE_ARGUS_SERVICE_KEY=""
  export TELEGRAM_CHAT_ID=""
  echo "[+] Loaded from macOS Keychain"

# Strategy 3: Nothing available
else
  echo "[!] No vault binary and no macOS Keychain available"
  echo "    Build the binary: cargo build --release"
  exit 1
fi

# ── Open-weights policy check ────────────────────────────────────────────────
set +e
python3 -I "$SCRIPT_DIR/infra/verify-open-models.py" "$SCRIPT_DIR/infra/litellm/config.yaml"
verify=$?
set -e
if [ $verify -eq 1 ]; then
  echo "[!] infra/litellm/config.yaml routes to a closed model. Refusing to start."
  exit 1
elif [ $verify -eq 2 ]; then
  if [ "${ARGUS_STRICT_OPEN:-0}" = "1" ]; then
    echo "[!] Could not verify open weights (offline) and ARGUS_STRICT_OPEN=1."; exit 1
  fi
  echo "[!] Could not reach OpenRouter to verify weights — continuing (local models unaffected)."
fi

if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "[!] No OpenRouter key — open/* hosted models disabled; local/* models still work."
fi
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "[!] TELEGRAM_BOT_TOKEN is empty — Telegram will be disabled"
fi

# ── Ollama: native app (macOS GPU) or container ──────────────────────────────
MODE="${ARGUS_OLLAMA:-}"
if [ -z "$MODE" ]; then
  if [ "$(uname)" = "Darwin" ]; then MODE=native; else MODE=container; fi
fi
PROFILE_ARGS=()
case "$MODE" in
  native)
    export OLLAMA_BASE_URL="http://host.docker.internal:11434"
    if command -v ollama &>/dev/null; then
      for m in ${OLLAMA_MODELS_TO_PULL:-qwen3:8b nomic-embed-text}; do
        ollama list 2>/dev/null | grep -q "^${m%%:*}" || { echo "[*] ollama pull $m"; ollama pull "$m"; }
      done
    else
      echo "[!] ARGUS_OLLAMA=native but no 'ollama' CLI found. Install from ollama.com or set ARGUS_OLLAMA=container."
    fi
    echo "[+] Using native Ollama at $OLLAMA_BASE_URL"
    ;;
  container)
    export OLLAMA_BASE_URL="http://ollama:11434"
    PROFILE_ARGS=(--profile ollama)
    echo "[+] Using containerized Ollama (first start pulls: ${OLLAMA_MODELS_TO_PULL:-qwen3:8b nomic-embed-text})"
    ;;
  none)
    echo "[!] Ollama disabled — only open/* hosted models will answer."
    ;;
esac

echo "[+] Secrets loaded — starting Argus stack..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" "${PROFILE_ARGS[@]}" up -d "$@"
echo ""
echo "[+] Argus is up."
echo "    Frontend:   http://localhost:3000"
echo "    WebSocket:  ws://localhost:9000/ws"
echo "    Lens feed:  ws://localhost:7900/stream"
echo "    LiteLLM:    http://localhost:4000  (bearer: vault llm_api_key)"
echo "    Logs:       docker compose logs -f"
