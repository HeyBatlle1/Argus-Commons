'use client';

import { create } from 'zustand';
import {
  EyeState, ModelId, AccessTier,
  Message, Tool, ToolCall,
  Memory, Curiosity, InnerTruth, PartnershipDynamic, Breakthrough,
  ServerMessage, Seat, SeatState, RoomEntry,
} from '@/lib/types';
import { ArgusConnection } from '@/lib/connection';
import { parseArtifacts } from '@/lib/artifacts';
import { DEFAULT_TOOLS, WS_URL, DEFAULT_ROSTER } from '@/lib/constants';
import { getModelTier } from '@/lib/models';
import { RealConnection } from './useWebSocket';

// ─── Dev-mode seed data (only loaded when no WS_URL is set) ───────────────
// Import paths from lib/dev/ are intentionally isolated — never referenced
// outside this conditional block.

const IS_DEV = !WS_URL;

function loadDevData() {
  if (!IS_DEV) return { memories: [], curiosities: [], innerTruths: [], dynamics: [], breakthroughs: [], messages: [] };
  // Dynamic import of dev data — tree-shaken in prod builds
  const {
    DEV_MEMORIES, DEV_CURIOSITIES, DEV_INNER_TRUTHS, DEV_DYNAMICS, DEV_BREAKTHROUGHS,
  } = require('@/lib/dev/mock-connection');

  const seedMessages: Message[] = [
    {
      id: 'seed-1',
      role: 'user',
      content: 'Argus, what is your current operational status?',
      timestamp: new Date(Date.now() - 5 * 60 * 1000),
    },
    {
      id: 'seed-tc-1',
      role: 'assistant',
      content: '',
      timestamp: new Date(Date.now() - 4 * 60 * 1000),
      toolCalls: [{
        id: 'tc-seed-1',
        name: 'recall',
        args: { query: 'system status', limit: 5 },
        result: 'Found 5 memories: vault configured, model set, memory backend online.',
        success: true,
        state: 'complete' as const,
        startedAt: new Date(Date.now() - 4 * 60 * 1000 - 10000),
        completedAt: new Date(Date.now() - 4 * 60 * 1000),
      }],
    },
    {
      id: 'seed-2',
      role: 'assistant',
      content: `## Status: Dev Mode\n\n**Runtime:** argus-cli v0.1.0\n**Model:** Gemma 4 E4B (Royal tier — local, via Ollama + LiteLLM)\n**Memory:** ${DEV_MEMORIES.length} dev entries loaded\n**Mode:** Mock — set \`NEXT_PUBLIC_WS_URL\` to connect the real backend\n\nThe hundred eyes are open. What needs doing?`,
      timestamp: new Date(Date.now() - 4 * 60 * 1000),
    },
  ];

  return {
    memories: DEV_MEMORIES as Memory[],
    curiosities: DEV_CURIOSITIES as Curiosity[],
    innerTruths: DEV_INNER_TRUTHS as InnerTruth[],
    dynamics: DEV_DYNAMICS as PartnershipDynamic[],
    breakthroughs: DEV_BREAKTHROUGHS as Breakthrough[],
    messages: seedMessages,
  };
}

const devData = loadDevData();

// ─── Store interface ───────────────────────────────────────────────────────

interface AgentStore {
  // Connection
  connected: boolean;
  wsLatency: number;
  startTime: Date;

  // Agent state
  eyeState: EyeState;
  activeModel: ModelId;
  accessTier: AccessTier;
  isStreaming: boolean;

  // Conversation
  messages: Message[];
  streamingContent: string;

  // Tools
  tools: Tool[];
  activeToolCalls: ToolCall[];

  // Memory (populated from backend in prod; dev data in dev mode)
  memories: Memory[];
  curiosities: Curiosity[];
  innerTruths: InnerTruth[];
  partnershipDynamics: PartnershipDynamic[];
  breakthroughs: Breakthrough[];

  // Vault + MCP live state (populated from Connected WS message)
  vaultKeys: string[];
  mcpServers: string[];

  // The Commons
  roster: Seat[];
  seated: string[];            // seat ids in the room
  ambient: boolean;            // keep talking without the operator
  roomRunning: boolean;
  roomRound: { round: number; of: number } | null;
  seatStates: Record<string, SeatState>;
  room: RoomEntry[];
  stage: 'commons' | 'solo';
  /** last agent that did anything — the Lens follows it */
  spotlight: string | null;

  // Internal
  _ws: ArgusConnection | null;

  // Actions
  sendMessage: (content: string) => void;
  switchModel: (model: ModelId) => void;
  setEyeState: (state: EyeState) => void;
  initConnection: () => void;
  _handleServerMessage: (msg: ServerMessage) => void;
  sendRoom: (content: string) => void;
  stopRoom: () => void;
  toggleSeat: (id: string) => void;
  setAmbient: (on: boolean) => void;
  setStage: (stage: 'commons' | 'solo') => void;
}

let roomSeq = 0;
const rid = (p: string) => `${p}-${Date.now()}-${roomSeq++}`;

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Connection
  connected: false,
  wsLatency: 12,
  startTime: new Date(),

  // Agent state — prod starts watching, dev same
  eyeState: 'watching',
  activeModel: 'local/gemma4-e4b',
  accessTier: 'royal',
  isStreaming: false,

  // Conversation — empty in prod, seeded in dev
  messages: devData.messages,
  streamingContent: '',

  // Tools
  tools: DEFAULT_TOOLS,
  activeToolCalls: [],

  // Memory — empty in prod (backend populates), dev data otherwise
  memories: devData.memories,
  curiosities: devData.curiosities,
  innerTruths: devData.innerTruths,
  partnershipDynamics: devData.dynamics,
  breakthroughs: devData.breakthroughs,

  vaultKeys: [],
  mcpServers: [],

  roster: DEFAULT_ROSTER,
  seated: DEFAULT_ROSTER.map((s) => s.id),
  ambient: false,
  roomRunning: false,
  roomRound: null,
  seatStates: {},
  room: [],
  stage: 'commons',
  spotlight: null,

  _ws: null,

  // ─── Server message handler ────────────────────────────────────────────

  _handleServerMessage: (msg: ServerMessage) => {
    switch (msg.type) {
      case 'connected': {
        const roster = msg.roster && msg.roster.length ? msg.roster : get().roster;
        set((prev) => ({
          connected: true,
          vaultKeys: msg.vault_keys ?? [],
          mcpServers: msg.mcp_servers ?? [],
          activeModel: msg.model || prev.activeModel,
          accessTier: getModelTier(msg.model || prev.activeModel),
          roster,
          // keep the operator's seating if it still matches, else seat everyone
          seated: prev.seated.filter((id) => roster.some((s) => s.id === id)).length
            ? prev.seated.filter((id) => roster.some((s) => s.id === id))
            : roster.map((s) => s.id),
        }));
        break;
      }

      // ── The Commons ────────────────────────────────────────────────────
      case 'room_round':
        set((prev) => ({
          roomRunning: true,
          roomRound: { round: msg.round, of: msg.of },
          seatStates: Object.fromEntries(prev.seated.map((id) => [id, 'idle' as SeatState])),
          room: msg.round > 1
            ? [...prev.room, { kind: 'note', id: rid('round'), tone: 'round', content: `round ${msg.round} of ${msg.of}${msg.ambient ? ' · ambient' : ''}`, timestamp: new Date() }]
            : prev.room,
        }));
        break;

      case 'room_thinking':
        set((prev) => ({ seatStates: { ...prev.seatStates, [msg.agent]: 'thinking' }, spotlight: msg.agent }));
        break;

      case 'room_tool_call': {
        const call: ToolCall = { id: msg.callId, name: msg.name, args: msg.args, state: 'executing', startedAt: new Date() };
        set((prev) => ({
          seatStates: { ...prev.seatStates, [msg.agent]: 'executing' },
          spotlight: msg.agent,
          room: [...prev.room, { kind: 'tool', id: rid('tool'), agent: msg.agent, call, timestamp: new Date() }],
          tools: prev.tools.map((t) => (t.name === msg.name ? { ...t, state: 'active' as const } : t)),
        }));
        break;
      }

      case 'room_tool_result': {
        const now = new Date();
        set((prev) => ({
          seatStates: { ...prev.seatStates, [msg.agent]: 'thinking' },
          room: prev.room.map((e) =>
            e.kind === 'tool' && e.call.id === msg.callId
              ? { ...e, call: { ...e.call, result: msg.result, success: msg.success, state: msg.success ? 'complete' : 'error', completedAt: now } }
              : e,
          ),
          tools: prev.tools.map((t) =>
            t.name === msg.name ? { ...t, state: 'complete' as const, callCount: t.callCount + 1, lastCall: now } : t,
          ),
        }));
        break;
      }

      case 'room_message': {
        const { cleanText, artifacts } = parseArtifacts(msg.content);
        set((prev) => ({
          seatStates: { ...prev.seatStates, [msg.agent]: 'spoke' },
          room: [...prev.room, {
            kind: 'agent', id: rid('say'), agent: msg.agent, content: cleanText,
            artifacts: artifacts.length ? artifacts : undefined, timestamp: new Date(),
          }],
        }));
        break;
      }

      case 'room_pass':
        set((prev) => ({
          seatStates: { ...prev.seatStates, [msg.agent]: 'passed' },
          room: [...prev.room, { kind: 'note', id: rid('pass'), tone: 'pass', agent: msg.agent, content: 'passes', timestamp: new Date() }],
        }));
        break;

      case 'room_error':
        set((prev) => ({
          seatStates: { ...prev.seatStates, [msg.agent]: 'error' },
          room: [...prev.room, { kind: 'note', id: rid('err'), tone: 'error', agent: msg.agent, content: msg.message, timestamp: new Date() }],
        }));
        break;

      case 'room_idle':
        set((prev) => ({
          roomRunning: false,
          roomRound: null,
          room: [...prev.room, { kind: 'note', id: rid('idle'), tone: 'idle', content: msg.reason, timestamp: new Date() }],
          tools: prev.tools.map((t) => (t.state === 'active' ? { ...t, state: 'complete' as const } : t)),
        }));
        setTimeout(() => set({ seatStates: {} }), 2500);
        break;

      case 'thinking':
        set({ eyeState: 'thinking', isStreaming: true, streamingContent: '' });
        break;

      case 'tool_call': {
        const tc: ToolCall = {
          id: msg.callId,
          name: msg.name,
          args: msg.args,
          state: 'executing',
          startedAt: new Date(),
        };
        set((prev) => ({
          eyeState: 'executing',
          spotlight: 'argus',
          activeToolCalls: [...prev.activeToolCalls, tc],
          tools: prev.tools.map((t) =>
            t.name === msg.name ? { ...t, state: 'active' as const } : t
          ),
          messages: [
            ...prev.messages,
            {
              id: 'tc-' + msg.callId,
              role: 'assistant' as const,
              content: '',
              timestamp: new Date(),
              toolCalls: [tc],
            },
          ],
        }));
        break;
      }

      case 'tool_result': {
        const now = new Date();
        set((prev) => ({
          activeToolCalls: prev.activeToolCalls.map((tc) =>
            tc.id === msg.callId
              ? { ...tc, result: msg.result, success: msg.success, state: 'complete' as const, completedAt: now }
              : tc
          ),
          messages: prev.messages.map((m) => {
            if (!m.toolCalls?.some((tc) => tc.id === msg.callId)) return m;
            return {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === msg.callId
                  ? { ...tc, result: msg.result, success: msg.success, state: 'complete' as const, completedAt: now }
                  : tc
              ),
            };
          }),
          tools: prev.tools.map((t) =>
            t.name === msg.name
              ? { ...t, state: 'complete' as const, callCount: t.callCount + 1, lastCall: now }
              : t
          ),
        }));
        break;
      }

      case 'response_chunk':
        set((prev) => ({
          streamingContent: prev.streamingContent + msg.content,
          eyeState: 'thinking',
        }));
        break;

      case 'response_complete': {
        const { cleanText, artifacts } = parseArtifacts(msg.content);
        set((prev) => ({
          messages: [
            ...prev.messages,
            {
              id: 'resp-' + Date.now(),
              role: 'assistant' as const,
              content: cleanText,
              timestamp: new Date(),
              artifacts: artifacts.length > 0 ? artifacts : undefined,
            },
          ],
          streamingContent: '',
          isStreaming: false,
          eyeState: 'complete',
          activeToolCalls: [],
        }));
        setTimeout(() => set({ eyeState: 'watching' }), 1500);
        break;
      }

      case 'status':
        set({ eyeState: msg.eye_state, activeModel: msg.model, accessTier: getModelTier(msg.model) });
        break;

      case 'memory_update':
        set({ memories: msg.memories });
        break;

      case 'error':
        set((prev) => ({
          eyeState: 'watching',
          isStreaming: false,
          streamingContent: '',
          messages: [
            ...prev.messages,
            {
              id: 'err-' + Date.now(),
              role: 'assistant' as const,
              content: `**Error:** ${msg.message}`,
              timestamp: new Date(),
            },
          ],
        }));
        break;
    }
  },

  // ─── Init connection ───────────────────────────────────────────────────
  // Called once on mount. Uses real WS in prod, mock in dev.

  initConnection: () => {
    if (get()._ws) return;

    const handler = (msg: ServerMessage) => get()._handleServerMessage(msg);

    if (WS_URL) {
      // Production: real WebSocket to Rust backend
      const ws = new RealConnection(WS_URL, handler, (connected) => set({ connected }));
      set({ _ws: ws });
    } else {
      // Development: mock connection — no real API calls
      const { MockConnection } = require('@/lib/dev/mock-connection');
      const ws = new MockConnection(handler, get().activeModel) as ArgusConnection;
      set({ _ws: ws, connected: true });
    }
  },

  // ─── Actions ───────────────────────────────────────────────────────────

  sendMessage: (content: string) => {
    const store = get();
    if (!store._ws) store.initConnection();
    if (store.isStreaming) return;

    set((prev) => ({
      messages: [
        ...prev.messages,
        { id: 'user-' + Date.now(), role: 'user' as const, content, timestamp: new Date() },
      ],
    }));

    get()._ws!.send({ type: 'user_message', content });
  },

  switchModel: (model: ModelId) => {
    set({ activeModel: model, accessTier: getModelTier(model) });
    get()._ws?.send({ type: 'switch_model', model });
  },

  setEyeState: (state: EyeState) => set({ eyeState: state }),

  // ─── Commons actions ───────────────────────────────────────────────────

  sendRoom: (content: string) => {
    const store = get();
    if (!store._ws) store.initConnection();
    const text = content.trim();
    if (!text) return;
    set((prev) => ({
      room: [...prev.room, { kind: 'operator', id: rid('op'), content: text, timestamp: new Date() }],
      roomRunning: true,
    }));
    get()._ws!.send({ type: 'room_message', content: text, seats: get().seated, ambient: get().ambient });
  },

  stopRoom: () => {
    get()._ws?.send({ type: 'room_stop' });
    set((prev) => ({
      room: [...prev.room, { kind: 'note', id: rid('stop'), tone: 'idle', content: 'stopping after the current speaker…', timestamp: new Date() }],
    }));
  },

  toggleSeat: (id: string) =>
    set((prev) => {
      const on = prev.seated.includes(id);
      if (on && prev.seated.length === 1) return prev; // someone has to be in the room
      return { seated: on ? prev.seated.filter((s) => s !== id) : prev.roster.map((s) => s.id).filter((s) => s === id || prev.seated.includes(s)) };
    }),

  setAmbient: (on: boolean) => set({ ambient: on }),
  setStage: (stage) => set({ stage }),
}));
