'use client';

/**
 * The Lens — client for the argus-browser screencast (browser/server.mjs).
 *
 * Frames arrive at up to ~25 fps. They never touch React state: they go to
 * per-agent listeners that paint straight into <img> elements. Only slow-moving
 * things (tabs, focus, recent actions, cursors) live in the zustand store.
 */

import { create } from 'zustand';
import { BROWSER_STREAM_URL } from '@/lib/constants';

export interface LensTab { agent: string; url: string; title: string; focused: boolean }
export interface LensAction {
  id: number;
  agent: string;
  action: string;
  ts: number;
  url?: string; x?: number; y?: number; text?: string; key?: string; label?: string; direction?: string;
}

type FrameListener = (dataUrl: string, w: number, h: number) => void;

interface LensStore {
  status: 'connecting' | 'live' | 'offline';
  tabs: LensTab[];
  focused: string | null;
  follow: boolean;
  actions: LensAction[];                       // newest last, capped
  cursors: Record<string, { x: number; y: number; ts: number }>;
  lastFrameAt: Record<string, number>;
  connect: () => void;
  focus: (agent: string) => void;
  setFollow: (on: boolean) => void;
}

const listeners = new Map<string, Set<FrameListener>>();
const latest = new Map<string, { url: string; w: number; h: number }>();

/** Subscribe to frames for one agent ('*' = whichever tab is focused). */
export function onFrame(agent: string, fn: FrameListener): () => void {
  if (!listeners.has(agent)) listeners.set(agent, new Set());
  listeners.get(agent)!.add(fn);
  const last = agent === '*' ? latest.get('*') : latest.get(agent);
  if (last) fn(last.url, last.w, last.h);
  return () => listeners.get(agent)?.delete(fn);
}

let ws: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let actionSeq = 0;
let frameStamp: Record<string, number> = {};
let stampFlush: ReturnType<typeof setTimeout> | null = null;

export const useLens = create<LensStore>((set, get) => ({
  status: 'connecting',
  tabs: [],
  focused: null,
  follow: true,
  actions: [],
  cursors: {},
  lastFrameAt: {},

  connect: () => {
    if (typeof window === 'undefined' || ws) return;
    try {
      ws = new WebSocket(BROWSER_STREAM_URL);
    } catch {
      set({ status: 'offline' });
      return;
    }
    set({ status: 'connecting' });

    ws.onopen = () => set({ status: 'live' });
    ws.onclose = () => {
      ws = null;
      set({ status: 'offline' });
      if (!retry) retry = setTimeout(() => { retry = null; get().connect(); }, 4000);
    };
    ws.onerror = () => { /* onclose handles it */ };

    ws.onmessage = (ev) => {
      let d: Record<string, unknown>;
      try { d = JSON.parse(ev.data as string); } catch { return; }
      switch (d.type) {
        case 'frame': {
          const agent = d.agent as string;
          const url = `data:image/jpeg;base64,${d.data as string}`;
          const w = d.w as number, h = d.h as number;
          latest.set(agent, { url, w, h });
          listeners.get(agent)?.forEach((fn) => fn(url, w, h));
          if (d.focused) {
            latest.set('*', { url, w, h });
            listeners.get('*')?.forEach((fn) => fn(url, w, h));
          }
          // Batch "last frame" timestamps so the UI can show liveness without
          // re-rendering on every frame.
          frameStamp[agent] = Date.now();
          if (!stampFlush) stampFlush = setTimeout(() => {
            stampFlush = null;
            set((p) => ({ lastFrameAt: { ...p.lastFrameAt, ...frameStamp } }));
            frameStamp = {};
          }, 500);
          break;
        }
        case 'tabs': {
          const tabs = (d.tabs as LensTab[]) ?? [];
          const f = tabs.find((t) => t.focused)?.agent ?? get().focused;
          set({ tabs, focused: f, follow: (d.follow as boolean | undefined) ?? get().follow });
          break;
        }
        case 'focus':
          set({ focused: d.agent as string });
          { const l = latest.get(d.agent as string); if (l) { latest.set('*', l); listeners.get('*')?.forEach((fn) => fn(l.url, l.w, l.h)); } }
          break;
        case 'cursor':
          set((p) => ({ cursors: { ...p.cursors, [d.agent as string]: { x: d.x as number, y: d.y as number, ts: Date.now() } } }));
          break;
        case 'action': {
          const a = { ...(d as unknown as LensAction), id: actionSeq++ };
          set((p) => ({
            actions: [...p.actions.slice(-39), a],
            cursors: a.x != null && a.y != null ? { ...p.cursors, [a.agent]: { x: a.x, y: a.y, ts: Date.now() } } : p.cursors,
          }));
          break;
        }
      }
    };
  },

  focus: (agent) => {
    ws?.send(JSON.stringify({ type: 'focus', agent }));
    set({ focused: agent, follow: false });
    const l = latest.get(agent);
    if (l) { latest.set('*', l); listeners.get('*')?.forEach((fn) => fn(l.url, l.w, l.h)); }
  },

  setFollow: (on) => {
    ws?.send(JSON.stringify({ type: 'follow', on }));
    set({ follow: on });
  },
}));

/** Human sentence for an action — used as the Lens caption. */
export function describeAction(a: LensAction, name: string): string {
  const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return u ?? ''; } };
  switch (a.action) {
    case 'navigate': return `${name} opens ${host(a.url)}`;
    case 'click':    return `${name} clicks ${a.label ? `“${a.label.trim().slice(0, 40)}”` : 'an element'}`;
    case 'type':     return `${name} types “${(a.text ?? '').slice(0, 40)}”`;
    case 'press':    return `${name} presses ${a.key}`;
    case 'scroll':   return `${name} scrolls ${a.direction}`;
    case 'back':     return `${name} goes back`;
    case 'read':     return `${name} reads the page`;
    default:         return `${name} · ${a.action}`;
  }
}
