import { ModelId, AccessTier } from './types';

/**
 * Open-weights roster. IDs are LiteLLM aliases from infra/litellm/config.yaml —
 * that file is the only place a model can be added, and argus-up.sh refuses to
 * launch if anything closed slips in.
 *
 * Tier meaning (it used to be "which company", now it's "where your data goes"):
 *   ROYAL  — local/*: runs on your hardware, prompts never leave the machine
 *            → full access to the Mind (memories, inner truth, dynamics…)
 *   ALLIED — open/*:  open weights hosted on OpenRouter, prompts leave the box
 *            → limited memory scope, same rule the UI always enforced
 */
export interface ModelConfig {
  id: ModelId;
  name: string;
  tier: AccessTier;
  tierLabel: string;
  icon: string;
  color: string;
  provider: string;
  /** Upstream id (Ollama tag or OpenRouter id) — informational */
  upstream: string;
  note: string;
}

const m = (
  id: string, name: string, provider: string, upstream: string, note: string,
): ModelConfig => {
  const local = id.startsWith('local/');
  return {
    id, name, provider, upstream, note,
    tier: local ? 'royal' : 'allied',
    tierLabel: local ? 'Royal' : 'Allied',
    icon: local ? '◆' : '◇',
    color: local ? '#d9b36c' : '#5fc7b0',
  };
};

export const MODEL_CONFIG: Record<ModelId, ModelConfig> = {
  'local/qwen3-8b':          m('local/qwen3-8b', 'Qwen3 8B', 'ollama', 'qwen3:8b', 'fast · default'),
  'local/qwen3.6-27b':       m('local/qwen3.6-27b', 'Qwen3.6 27B', 'ollama', 'qwen3.6:27b', 'strong generalist'),
  'local/gpt-oss-20b':       m('local/gpt-oss-20b', 'gpt-oss 20B', 'ollama', 'gpt-oss:20b', 'Apache-2.0 · tools'),
  'local/gemma4-26b':        m('local/gemma4-26b', 'Gemma 4 26B', 'ollama', 'gemma4:26b', 'MoE'),
  'open/deepseek-v4.1-flash':m('open/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'openrouter', 'deepseek/deepseek-v4.1-flash', 'cheap · fast'),
  'open/glm-5.3':            m('open/glm-5.3', 'GLM-5.3', 'openrouter', 'z-ai/glm-5.3', 'balanced'),
  'open/kimi-k3':            m('open/kimi-k3', 'Kimi K3', 'openrouter', 'moonshotai/kimi-k3', 'deep'),
  'open/mistral-large-4':    m('open/mistral-large-4', 'Mistral Large 4', 'openrouter', 'mistralai/mistral-large-4-0', '1T MoE'),
  'open/mimo-v2.6-pro':      m('open/mimo-v2.6-pro', 'MiMo V2.6 Pro', 'openrouter', 'xiaomi/mimo-v2.6-pro', '1M ctx'),
  'open/qwen3.8-27b':        m('open/qwen3.8-27b', 'Qwen3.8 27B', 'openrouter', 'qwen/qwen3.8-27b', 'hosted'),
  'open/nemotron-3.5-super': m('open/nemotron-3.5-super', 'Nemotron 3.5 Super', 'openrouter', 'nvidia/nemotron-3.5-super-vl', 'vision'),
};

export const MODELS_IN_ORDER: ModelId[] = Object.keys(MODEL_CONFIG);

/** Config for any alias, including ones added to LiteLLM but not listed above. */
export function modelConfig(id: ModelId): ModelConfig {
  return MODEL_CONFIG[id] ?? m(id, id.replace(/^(local|open)\//, ''), id.startsWith('local/') ? 'ollama' : 'openrouter', id, 'custom');
}

export function getModelTier(model: ModelId): AccessTier {
  if (!model) return 'guest';
  return modelConfig(model).tier;
}
