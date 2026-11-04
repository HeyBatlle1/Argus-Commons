#!/usr/bin/env python3
"""Refuse to launch Argus if the LiteLLM config routes to a closed model.

Rules:
  * `ollama/` and `ollama_chat/` entries are local open weights → allowed.
  * `openrouter/<id>` entries must have a non-empty `hugging_face_id` on
    OpenRouter (i.e. the weights are published) → otherwise rejected.
  * Any other provider prefix (anthropic/, openai/, gemini/, vertex_ai/, xai/,
    bedrock/, azure/ …) is rejected outright.

Standard library only. Exit code 0 = clean, 1 = closed model found,
2 = could not verify (network down) — argus-up.sh treats 2 as a warning
unless ARGUS_STRICT_OPEN=1.

Usage: python3 infra/verify-open-models.py [path/to/config.yaml]
"""
import json
import re
import sys
import urllib.request

CONFIG = sys.argv[1] if len(sys.argv) > 1 else "infra/litellm/config.yaml"
LOCAL_PREFIXES = ("ollama/", "ollama_chat/")

# Belt and braces: even if OpenRouter someday lists one of these with an HF id,
# these families are not open-weight and are never allowed.
DENY_SUBSTRINGS = ("anthropic/", "claude", "gemini", "x-ai/", "grok", "openai/gpt-4",
                   "openai/gpt-5", "openai/o1", "openai/o3", "openai/o4")


def model_lines(path):
    out = []
    in_params = False
    for raw in open(path, encoding="utf-8"):
        line = raw.split("#", 1)[0].rstrip()
        if re.match(r"^\s*litellm_params:\s*$", line):
            in_params = True
            continue
        m = re.match(r"^\s*model:\s*(\S+)\s*$", line)
        if in_params and m:
            out.append(m.group(1).strip("'\""))
            in_params = False
    return out


def main():
    models = model_lines(CONFIG)
    if not models:
        print(f"[verify] no models found in {CONFIG}")
        return 1

    bad, remote = [], []
    for m in models:
        low = m.lower()
        if any(s in low for s in DENY_SUBSTRINGS):
            bad.append((m, "closed-model family"))
        elif m.startswith(LOCAL_PREFIXES):
            continue
        elif m.startswith("openrouter/"):
            remote.append(m[len("openrouter/"):])
        else:
            bad.append((m, "provider not allowed (only ollama/ or openrouter/ open weights)"))

    if remote:
        try:
            req = urllib.request.Request("https://openrouter.ai/api/v1/models",
                                         headers={"User-Agent": "argus-verify"})
            with urllib.request.urlopen(req, timeout=20) as r:
                catalog = {d["id"]: d for d in json.load(r)["data"]}
            # Embedding models live in a separate catalog.
            ereq = urllib.request.Request("https://openrouter.ai/api/v1/embeddings/models",
                                          headers={"User-Agent": "argus-verify"})
            with urllib.request.urlopen(ereq, timeout=20) as r:
                for d in json.load(r).get("data", []):
                    catalog.setdefault(d["id"], d)
        except Exception as e:  # noqa: BLE001
            print(f"[verify] could not reach OpenRouter to verify weights: {e}")
            for b in bad:
                print(f"[verify] REJECT {b[0]} — {b[1]}")
            return 1 if bad else 2

        for mid in remote:
            entry = catalog.get(mid)
            if entry is None:
                bad.append((f"openrouter/{mid}", "not listed on OpenRouter (renamed or removed?)"))
            elif not entry.get("hugging_face_id"):
                bad.append((f"openrouter/{mid}", "no published weights (closed model)"))
            else:
                print(f"[verify] ok   openrouter/{mid}  ←  hf:{entry['hugging_face_id']}")

    for m in models:
        if m.startswith(LOCAL_PREFIXES):
            print(f"[verify] ok   {m}  (local)")

    for m, why in bad:
        print(f"[verify] REJECT {m} — {why}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
