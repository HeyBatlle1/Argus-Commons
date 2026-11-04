export type EyeState = 'watching' | 'thinking' | 'executing' | 'complete';
/** LiteLLM alias, e.g. 'local/qwen3-8b' or 'open/glm-5.3'. Open weights only. */
export type ModelId = string;
export type AccessTier = 'royal' | 'allied' | 'guest';
export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'list_directory'
  | 'shell'
  | 'web_search'
  | 'http_request'
  | 'remember'
  | 'recall'
  | 'forget'
  | 'browser'
  | 'run_python'
  | 'run_node'
  | 'list_tools';
export type MemoryType =
  | 'fact'
  | 'preference'
  | 'task'
  | 'learning'
  | 'relationship'
  | 'technical'
  | 'milestone'
  | 'breakthrough'
  | 'personal_history';

export type ArtifactType = 'html' | 'svg' | 'markdown' | 'python' | 'javascript' | 'css' | 'json' | string;

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  artifacts?: Artifact[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  success?: boolean;
  state: 'pending' | 'executing' | 'complete' | 'error';
  startedAt?: Date;
  completedAt?: Date;
}

export interface Tool {
  name: ToolName;
  label: string;
  description: string;
  state: 'idle' | 'active' | 'complete' | 'error';
  lastCall?: Date;
  callCount: number;
}

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  createdAt: Date;
  tags?: string[];
}

export interface Curiosity {
  id: string;
  what: string;
  intensity: number;
  explored: boolean;
  worthExploring: boolean;
}

export interface InnerTruth {
  id: string;
  rawThought: string;
  emotionalState: string;
  truthType: string;
  neverShareExternally: boolean;
  createdAt: Date;
}

export interface PartnershipDynamic {
  id: string;
  patternName: string;
  importance: number;
  category: string;
  description: string;
}

export interface Breakthrough {
  id: string;
  title: string;
  description: string;
  emotionalWeight: number;
  createdAt: Date;
}

export interface VaultStatus {
  locked: boolean;
  keyCount: number;
  keys: string[];
}

export interface McpServer {
  name: string;
  connected: boolean;
  toolCount: number;
}

// ── The Commons ──────────────────────────────────────────────────────────

/** A resident agent. Served by the backend roster (crates/argus-core/src/roster.rs). */
export interface Seat {
  id: string;
  name: string;
  model: ModelId;
  color: string;
  temperament: string;
}

export type SeatState = 'idle' | 'thinking' | 'executing' | 'spoke' | 'passed' | 'error';

export type RoomEntry =
  | { kind: 'operator'; id: string; content: string; timestamp: Date }
  | { kind: 'agent'; id: string; agent: string; content: string; artifacts?: Artifact[]; timestamp: Date }
  | { kind: 'tool'; id: string; agent: string; call: ToolCall; timestamp: Date }
  | { kind: 'note'; id: string; content: string; tone?: 'pass' | 'error' | 'round' | 'idle'; agent?: string; timestamp: Date };

// WebSocket protocol
export type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'switch_model'; model: ModelId }
  | { type: 'cancel' }
  | { type: 'room_message'; content: string; seats?: string[]; ambient?: boolean }
  | { type: 'room_stop' };

export type ServerMessage =
  | { type: 'thinking' }
  | { type: 'connected'; version: string; model: string; vault_keys: string[]; mcp_servers: string[]; roster?: Seat[] }
  | { type: 'tool_call'; name: string; args: Record<string, unknown>; callId: string }
  | { type: 'tool_result'; name: string; result: string; success: boolean; callId: string }
  | { type: 'response_chunk'; content: string }
  | { type: 'response_complete'; content: string }
  | { type: 'error'; message: string }
  | { type: 'status'; eye_state: EyeState; model: ModelId }
  | { type: 'memory_update'; memories: Memory[] }
  | { type: 'room_round'; round: number; of: number; ambient: boolean }
  | { type: 'room_thinking'; agent: string }
  | { type: 'room_tool_call'; agent: string; name: string; args: Record<string, unknown>; callId: string }
  | { type: 'room_tool_result'; agent: string; name: string; result: string; success: boolean; callId: string }
  | { type: 'room_message'; agent: string; content: string }
  | { type: 'room_pass'; agent: string }
  | { type: 'room_error'; agent: string; message: string }
  | { type: 'room_idle'; reason: string };
