'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLens, onFrame, describeAction, LensAction } from '@/hooks/useLens';
import { useAgentStore } from '@/hooks/useAgentState';
import { ARGUS_SEAT, BROWSER_STREAM_URL } from '@/lib/constants';
import { PanelTitle } from '@/components/shared/PanelTitle';
import { Seat } from '@/lib/types';

/**
 * THE LENS — a live window into the agents' real Chromium.
 * Always on screen. Every seat has its own tab; the Lens follows whoever acted
 * last unless the operator pins a tab. Ghost cursors, click ripples and typed
 * text are drawn from the browser's action events, so you see intent, not
 * just pixels.
 */
export function Lens() {
  const connect = useLens((s) => s.connect);
  const status = useLens((s) => s.status);
  const tabs = useLens((s) => s.tabs);
  const focused = useLens((s) => s.focused);
  const follow = useLens((s) => s.follow);
  const setFollow = useLens((s) => s.setFollow);
  const focus = useLens((s) => s.focus);
  const actions = useLens((s) => s.actions);
  const cursors = useLens((s) => s.cursors);
  const lastFrameAt = useLens((s) => s.lastFrameAt);
  const roster = useAgentStore((s) => s.roster);

  useEffect(() => { connect(); }, [connect]);

  const seats = useMemo(() => {
    const map: Record<string, Seat> = { argus: ARGUS_SEAT };
    roster.forEach((s) => { map[s.id] = s; });
    return map;
  }, [roster]);
  const seatOf = (id: string): Seat => seats[id] ?? { id, name: id, model: '', color: '#9b9a8d', temperament: '' };

  const focusedTab = tabs.find((t) => t.agent === focused);
  const lastAction = [...actions].reverse().find((a) => a.agent === focused) ?? actions[actions.length - 1];
  const hasPicture = status === 'live' && tabs.length > 0;

  // tick so "idle 12s" and cursor fade stay current without frame-rate renders
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  const since = focused && lastFrameAt[focused] ? Math.round((Date.now() - lastFrameAt[focused]) / 1000) : null;

  return (
    <section className="flex flex-col h-full min-h-0" aria-label="The Lens — live agent browser">
      <PanelTitle
        numeral="◉"
        title="The Lens"
        kicker={status === 'live' ? `live chromium · ${tabs.length} tab${tabs.length === 1 ? '' : 's'}` : status === 'connecting' ? 'connecting…' : 'dark'}
        right={
          <>
            {focusedTab && (
              <span className="hidden md:inline-flex items-center max-w-[340px] truncate px-2.5 py-1 rounded-full border border-argus-border text-[10.5px] font-mono text-argus-textDim">
                <span className="mr-1.5" style={{ color: seatOf(focusedTab.agent).color }}>●</span>
                <span className="truncate">{focusedTab.url.replace(/^https?:\/\//, '')}</span>
              </span>
            )}
            <button className="btn-ghost" data-on={follow} onClick={() => setFollow(!follow)} title="Follow whichever agent acts">
              {follow ? 'following' : 'pinned'}
            </button>
          </>
        }
      />

      <div className="flex-1 min-h-0 flex gap-3 px-4 pt-3 pb-2">
        {/* main frame */}
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
          <div className="lens-frame h-full max-w-full" style={{ aspectRatio: '16 / 10' }}>
            {hasPicture ? (
              <>
                <FrameImg agent="*" className="lens-img" />
                <Overlays
                  actions={actions}
                  cursors={cursors}
                  seatOf={seatOf}
                  focused={focused}
                />
              </>
            ) : (
              <Standby status={status} />
            )}
          </div>
        </div>

        {/* other agents' tabs */}
        {tabs.length > 1 && (
          <div className="w-[150px] flex-shrink-0 flex flex-col gap-2 overflow-y-auto pr-0.5">
            {tabs.map((t) => {
              const seat = seatOf(t.agent);
              const on = t.agent === focused;
              return (
                <button
                  key={t.agent}
                  onClick={() => focus(t.agent)}
                  className="text-left group"
                  title={`${seat.name} — ${t.title || t.url}`}
                >
                  <div
                    className="rounded-md overflow-hidden bg-black transition-all"
                    style={{
                      aspectRatio: '16 / 10',
                      boxShadow: on ? `0 0 0 1.5px ${seat.color}` : '0 0 0 1px #2a322f',
                      opacity: on ? 1 : 0.72,
                    }}
                  >
                    <FrameImg agent={t.agent} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: seat.color }} />
                    <span className="text-[10.5px] font-mono truncate" style={{ color: on ? seat.color : '#9b9a8d' }}>{seat.name}</span>
                  </div>
                  <div className="text-[9.5px] font-mono text-argus-textFaint truncate">{t.title || t.url.replace(/^https?:\/\//, '')}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* caption */}
      <div className="px-4 pb-2.5 flex items-center gap-3 min-h-[28px]">
        {lastAction && hasPicture ? (
          <>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seatOf(lastAction.agent).color }} />
            <span className="display italic text-[14px] text-argus-text truncate">
              {describeAction(lastAction, seatOf(lastAction.agent).name)}
            </span>
          </>
        ) : focusedTab && hasPicture ? (
          <>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seatOf(focusedTab.agent).color }} />
            <span className="display italic text-[14px] text-argus-textDim truncate">
              {seatOf(focusedTab.agent).name}’s tab — {focusedTab.title || focusedTab.url}
            </span>
          </>
        ) : (
          <span className="display italic text-[14px] text-argus-textFaint truncate">
            {status === 'live' ? 'No agent has opened a page yet. Ask one to look something up.' : 'Waiting for the browser…'}
          </span>
        )}
        <span className="ml-auto kicker flex-shrink-0">
          {since === null ? '' : since <= 2 ? <span className="text-argus-greenLight">● live</span> : `still · ${since}s`}
        </span>
      </div>
    </section>
  );
}

/** <img> painted directly from the frame stream — no React re-render per frame. */
function FrameImg({ agent, className }: { agent: string; className: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => onFrame(agent, (url) => { if (ref.current) ref.current.src = url; }), [agent]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt="" className={className} draggable={false} />;
}

function Overlays({
  actions, cursors, seatOf, focused,
}: {
  actions: LensAction[];
  cursors: Record<string, { x: number; y: number; ts: number }>;
  seatOf: (id: string) => Seat;
  focused: string | null;
}) {
  const now = Date.now();
  const recentClicks = actions.filter((a) => (a.action === 'click' || a.action === 'type') && a.x != null && now - a.ts < 1200 && a.agent === focused);
  const typing = [...actions].reverse().find((a) => a.action === 'type' && a.agent === focused && now - a.ts < 4000);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {Object.entries(cursors)
        .filter(([agent, c]) => agent === focused && now - c.ts < 9000)
        .map(([agent, c]) => {
          const seat = seatOf(agent);
          return (
            <div key={agent} className="lens-cursor" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
              <svg width="18" height="22" viewBox="0 0 18 22" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' }}>
                <path d="M1 1 L1 17 L5.5 13 L8.6 20.5 L11.6 19.2 L8.6 12 L15 12 Z" fill={seat.color} stroke="#0b0d0c" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span
                className="absolute left-4 top-5 whitespace-nowrap px-1.5 py-[1px] rounded text-[10px] font-mono"
                style={{ background: seat.color, color: '#0b0d0c' }}
              >
                {seat.name}
              </span>
            </div>
          );
        })}

      {recentClicks.map((a) => (
        <span key={a.id} className="lens-ripple" style={{ left: `${a.x! * 100}%`, top: `${a.y! * 100}%`, color: seatOf(a.agent).color }} />
      ))}

      {typing?.text && typing.x != null && (
        <div
          className="absolute px-2 py-1 rounded-md text-[12px] font-mono max-w-[50%] truncate"
          style={{
            left: `${typing.x * 100}%`, top: `calc(${typing.y! * 100}% - 34px)`,
            background: 'rgba(11,13,12,0.88)', color: seatOf(typing.agent).color, border: `1px solid ${seatOf(typing.agent).color}55`,
          }}
        >
          ⌨ {typing.text}
        </div>
      )}
    </div>
  );
}

/** Shown when the browser container isn't reachable or no tab is open yet. */
function Standby({ status }: { status: 'connecting' | 'live' | 'offline' }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <radialGradient id="lens-sb" cx="50%" cy="46%" r="60%">
            <stop offset="0%" stopColor="#2e8f87" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0b0d0c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="800" height="500" fill="url(#lens-sb)" />
        {[60, 100, 140, 180, 220, 260].map((r, i) => (
          <ellipse key={r} cx="400" cy="230" rx={r * 1.18} ry={r} fill="none"
            stroke={i === 0 ? '#d9b36c' : i < 3 ? '#2e8f87' : '#36403c'} strokeOpacity={i === 0 ? 0.5 : 0.35 - i * 0.04} strokeWidth="0.8" />
        ))}
      </svg>
      <div className="relative">
        <div className={`display italic text-[26px] text-argus-textBright ${status === 'connecting' ? 'breathe' : ''}`}>
          {status === 'live' ? 'The Lens is open.' : status === 'connecting' ? 'Opening the Lens…' : 'The Lens is dark.'}
        </div>
        <p className="mt-2 text-[13px] text-argus-textDim max-w-[440px] mx-auto leading-relaxed">
          {status === 'live'
            ? 'When an agent uses the browser, you’ll watch it here — every agent gets its own tab.'
            : <>No signal from <code className="font-mono text-[11.5px] text-argus-amberBright">{BROWSER_STREAM_URL}</code>. Start the <code className="font-mono text-[11.5px] text-argus-amberBright">argus-browser</code> container.</>}
        </p>
      </div>
    </div>
  );
}
