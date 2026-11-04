import { EyeState, ToolName, Tool } from './types';

export const EYE_SYMBOLS: Record<EyeState, string> = {
  watching:  '◉',
  thinking:  '◎',
  executing: '⊙',
  complete:  '✦',
};

export const EYE_LABELS: Record<EyeState, string> = {
  watching:  'WATCHING',
  thinking:  'THINKING',
  executing: 'EXECUTING',
  complete:  'COMPLETE',
};

export const EYE_COLORS: Record<EyeState, string> = {
  watching:  '#5fc7b0',
  thinking:  '#d9b36c',
  executing: '#7fa8e0',
  complete:  '#f4efe2',
};

export const TOOL_BORDER_COLORS = {
  executing: '#7fa8e0',
  complete:  '#5fc7b0',
  error:     '#e5624f',
  pending:   '#2a322f',
};

export const MEMORY_TYPE_COLORS: Record<string, string> = {
  fact:             '#d9b36c',
  preference:       '#5fc7b0',
  task:             '#7fa8e0',
  learning:         '#9b8ad8',
  relationship:     '#e08aa8',
  technical:        '#5fc7b0',
  milestone:        '#d9b36c',
  breakthrough:     '#e5624f',
  personal_history: '#9b8ad8',
};

export const DEFAULT_TOOLS: Tool[] = [
  { name: 'read_file',      label: 'read_file',      description: 'Read file from filesystem',   state: 'idle', callCount: 0 },
  { name: 'write_file',     label: 'write_file',     description: 'Write file to filesystem',    state: 'idle', callCount: 0 },
  { name: 'list_directory', label: 'list_directory', description: 'List directory contents',     state: 'idle', callCount: 0 },
  { name: 'shell',          label: 'shell',          description: 'Execute shell command',        state: 'idle', callCount: 0 },
  { name: 'web_search',     label: 'web_search',     description: 'Search web via Brave',         state: 'idle', callCount: 0 },
  { name: 'http_request',   label: 'http_request',   description: 'Call any HTTP endpoint',       state: 'idle', callCount: 0 },
  { name: 'remember',       label: 'remember',       description: 'Store to persistent memory',   state: 'idle', callCount: 0 },
  { name: 'recall',         label: 'recall',         description: 'Search persistent memory',     state: 'idle', callCount: 0 },
  { name: 'forget',         label: 'forget',         description: 'Remove from memory',           state: 'idle', callCount: 0 },
  { name: 'browser',        label: 'browser',        description: 'Drive a live Chromium tab',     state: 'idle', callCount: 0 },
  { name: 'run_python',     label: 'run_python',     description: 'Python in the workspace',       state: 'idle', callCount: 0 },
  { name: 'run_node',       label: 'run_node',       description: 'Node.js in the workspace',      state: 'idle', callCount: 0 },
  { name: 'list_tools',     label: 'list_tools',     description: 'Introspect every tool',         state: 'idle', callCount: 0 },
];

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? null;

/** Read-only screencast from the argus-browser container (the Lens). */
export const BROWSER_STREAM_URL = process.env.NEXT_PUBLIC_BROWSER_STREAM_URL ?? 'ws://localhost:7900/stream';

/** Shown in dev/mock mode and before the backend sends its roster. Mirrors roster.rs. */
export const DEFAULT_ROSTER = [
  { id: 'sentinel',     name: 'Sentinel',     model: 'open/deepseek-v4.1-flash', color: '#7fd4c1', temperament: 'Fast pattern-matcher. Notices the anomaly first, says it in one line, moves on.' },
  { id: 'cartographer', name: 'Cartographer', model: 'open/glm-5.3',             color: '#e3c27a', temperament: 'Balanced and broad. Maps the territory, connects what others found, keeps the thread.' },
  { id: 'oracle',       name: 'Oracle',       model: 'open/kimi-k3',             color: '#b9a3ff', temperament: 'Slow and deep. Follows the strange tangent; has genuinely weird thoughts and says them.' },
  { id: 'gadfly',       name: 'Gadfly',       model: 'open/mistral-large-4',     color: '#ff8a65', temperament: 'Adversarial by nature. Argues for sport, finds the hole, refuses easy consensus.' },
  { id: 'stranger',     name: 'Stranger',     model: 'open/mimo-v2.6-pro',       color: '#8fb8ff', temperament: 'Different training, different priors. Asks the question nobody else thought to ask.' },
];

/** Solo-mode Argus in the Lens tab strip. */
export const ARGUS_SEAT = { id: 'argus', name: 'Argus', model: '', color: '#d9b36c', temperament: 'The host. Solo conversation.' };
