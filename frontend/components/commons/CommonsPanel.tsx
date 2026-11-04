'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { useAgentStore } from '@/hooks/useAgentState';
import { useLens } from '@/hooks/useLens';
import { Ocellus } from '@/components/shared/Ocellus';
import { ArgusMessage } from '@/components/conversation/ArgusMessage';
import { ToolCallBlock } from '@/components/conversation/ToolCallBlock';
import { modelConfig } from '@/lib/models';
import { Artifact, EyeState, RoomEntry, Seat, SeatState } from '@/lib/types';

const SEAT_EYE: Record<SeatState, EyeState> = {
  idle: 'watching', thinking: 'thinking', executing: 'executing', spoke: 'complete', passed: 'watching', error: 'watching',
};
const SEAT_WORD: Record<SeatState, string> = {
  idle: 'listening', thinking: 'thinking', executing: 'working', spoke: 'spoke', passed: 'passed', error: 'error',
};

interface Props {
  onOpenArtifact: (artifacts: Artifact[], index: number) => void;
}

/**
 * THE COMMONS — where the resident agents hang out.
 * Seat who you want in the room, say something (or don't — ambient mode lets
 * them keep talking among themselves), and watch them argue and browse.
 */
export function CommonsPanel({ onOpenArtifact }: Props) {
  const roster = useAgentStore((s) => s.roster);
  const seated = useAgentStore((s) => s.seated);
  const seatStates = useAgentStore((s) => s.seatStates);
  const room = useAgentStore((s) => s.room);
  const running = useAgentStore((s) => s.roomRunning);
  const round = useAgentStore((s) => s.roomRound);
  const toggleSeat = useAgentStore((s) => s.toggleSeat);

  const seatMap = useMemo(() => Object.fromEntries(roster.map((s) => [s.id, s])) as Record<string, Seat>, [roster]);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [room.length, seatStates]);

  const thinking = Object.entries(seatStates).filter(([, st]) => st === 'thinking' || st === 'executing').map(([id]) => id);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* the bench */}
      <div className="flex gap-1.5 px-4 py-2.5 border-b border-argus-border overflow-x-auto flex-shrink-0">
        {roster.map((seat) => {
          const on = seated.includes(seat.id);
          const st = seatStates[seat.id] ?? 'idle';
          return (
            <button
              key={seat.id}
              onClick={() => toggleSeat(seat.id)}
              disabled={running}
              title={`${seat.temperament}\n${modelConfig(seat.model).name} · ${seat.model}\n${on ? 'Click to step out' : 'Click to seat'}`}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full border transition-colors disabled:cursor-not-allowed flex-shrink-0"
              style={{
                borderColor: on ? `${seat.color}66` : '#232a27',
                background: on ? `${seat.color}0d` : 'transparent',
              }}
            >
              <Ocellus size={22} state={on ? SEAT_EYE[st] : 'watching'} tone={on && st !== 'thinking' && st !== 'executing' ? seat.color : undefined} muted={!on} />
              <span className="flex flex-col items-start leading-tight">
                <span className="display italic text-[13.5px]" style={{ color: on ? seat.color : '#64675f' }}>{seat.name}</span>
                <span className="text-[9px] font-mono tracking-wider text-argus-textFaint">
                  {on ? (running ? SEAT_WORD[st] : modelConfig(seat.model).name) : 'stepped out'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* transcript */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {room.length === 0 && <EmptyRoom seats={roster.filter((s) => seated.includes(s.id))} />}
        {room.map((e) => <Entry key={e.id} entry={e} seatMap={seatMap} onOpenArtifact={onOpenArtifact} />)}
        {thinking.map((id) => seatMap[id] && (
          <div key={`t-${id}`} className="flex items-center gap-2 pl-4" style={{ color: seatMap[id].color }}>
            <span className="display italic text-[13px]">{seatMap[id].name}</span>
            <span className="flex gap-1"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></span>
            {seatStates[id] === 'executing' && <span className="kicker" style={{ color: seatMap[id].color }}>using tools</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <CommonsComposer running={running} round={round} />
    </div>
  );
}

function EmptyRoom({ seats }: { seats: Seat[] }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-8">
      <div className="flex -space-x-1.5 mb-4">
        {seats.map((s) => <Ocellus key={s.id} size={30} tone={s.color} />)}
      </div>
      <p className="display italic text-[22px] text-argus-textBright">The room is open.</p>
      <p className="mt-2 max-w-[460px] text-[13px] leading-relaxed text-argus-textDim">
        {seats.map((s) => s.name).join(', ')} {seats.length === 1 ? 'is' : 'are'} here. Bring them a question, a link,
        a disagreement — or turn on <span className="text-argus-amber">ambient</span> and let them talk among themselves.
        Disagreement is the point.
      </p>
    </div>
  );
}

function Entry({ entry, seatMap, onOpenArtifact }: {
  entry: RoomEntry; seatMap: Record<string, Seat>;
  onOpenArtifact: (a: Artifact[], i: number) => void;
}) {
  const focusLens = useLens((s) => s.focus);
  switch (entry.kind) {
    case 'operator':
      return (
        <div className="flex justify-end">
          <div className="max-w-[78%]">
            <div className="kicker text-right mb-1">you</div>
            <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-[14px] leading-relaxed text-argus-textBright"
              style={{ background: '#191e1c', border: '1px solid #2a322f' }}>
              {entry.content}
            </div>
          </div>
        </div>
      );
    case 'agent': {
      const seat = seatMap[entry.agent] ?? { name: entry.agent, color: '#9b9a8d', model: '' } as Seat;
      return (
        <div className="pl-4 relative">
          <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full" style={{ background: `${seat.color}aa` }} />
          <div className="flex items-baseline gap-2 mb-1">
            <span className="display italic text-[15.5px]" style={{ color: seat.color }}>{seat.name}</span>
            <span className="text-[9.5px] font-mono text-argus-textFaint">{modelConfig(seat.model).name}</span>
          </div>
          <ArgusMessage
            message={{ id: entry.id, role: 'assistant', content: entry.content, timestamp: entry.timestamp, artifacts: entry.artifacts }}
            onOpenArtifact={onOpenArtifact}
          />
        </div>
      );
    }
    case 'tool': {
      const seat = seatMap[entry.agent];
      return (
        <div className="pl-4">
          <button
            className="kicker hover:text-argus-text transition-colors"
            style={{ color: seat?.color }}
            onClick={() => entry.call.name === 'browser' && focusLens(entry.agent)}
            title={entry.call.name === 'browser' ? 'Show this tab in the Lens' : undefined}
          >
            {seat?.name ?? entry.agent} · {entry.call.name === 'browser' ? 'in the browser ↗' : 'tool'}
          </button>
          <ToolCallBlock toolCall={entry.call} />
        </div>
      );
    }
    case 'note': {
      const seat = entry.agent ? seatMap[entry.agent] : undefined;
      const color = entry.tone === 'error' ? '#e5624f' : '#64675f';
      return (
        <div className="flex items-center gap-3">
          <span className="flex-1 h-px bg-argus-border" />
          <span className="kicker" style={{ color }}>
            {seat && <span style={{ color: seat.color }}>{seat.name} </span>}
            {entry.content}
          </span>
          <span className="flex-1 h-px bg-argus-border" />
        </div>
      );
    }
  }
}

function CommonsComposer({ running, round }: { running: boolean; round: { round: number; of: number } | null }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const sendRoom = useAgentStore((s) => s.sendRoom);
  const stopRoom = useAgentStore((s) => s.stopRoom);
  const ambient = useAgentStore((s) => s.ambient);
  const setAmbient = useAgentStore((s) => s.setAmbient);
  const initConnection = useAgentStore((s) => s.initConnection);
  const seatedCount = useAgentStore((s) => s.seated.length);

  useEffect(() => { initConnection(); }, [initConnection]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [value]);

  function submit() {
    const t = value.trim();
    if (!t) return;
    setValue('');
    sendRoom(t); // while running, this lands in the transcript for the next speaker
  }

  return (
    <div className="flex-shrink-0 px-4 pb-3 pt-2 border-t border-argus-border">
      <div className="flex items-end gap-2 rounded-2xl border border-argus-border focus-within:border-argus-amberDim transition-colors px-3.5 py-2.5"
        style={{ background: '#101413' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={1}
          placeholder={running ? 'Interject — the next speaker will hear you…' : `Say something to the room (${seatedCount} seated)…`}
          className="bare-input flex-1 resize-none text-[14px] leading-relaxed text-argus-textBright"
          style={{ maxHeight: 140 }}
        />
        {running && (
          <button onClick={stopRoom} className="w-8 h-8 rounded-full flex items-center justify-center border border-argus-red/50 text-argus-red hover:bg-argus-red/10" title="Stop after the current speaker">
            <Square size={12} fill="currentColor" />
          </button>
        )}
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
          style={{ background: value.trim() ? '#d9b36c' : 'transparent', color: value.trim() ? '#17130b' : '#9b9a8d' }}
          title="Send to the room"
        >
          <Send size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <label className="flex items-center gap-2 cursor-pointer select-none" title="Let the agents keep talking among themselves for a few rounds">
          <button className="btn-ghost" data-on={ambient} onClick={() => setAmbient(!ambient)} disabled={running}>
            ambient {ambient ? 'on' : 'off'}
          </button>
          <span className="text-[10.5px] text-argus-textFaint">
            {ambient ? 'they’ll keep going until everyone passes or the round cap' : 'one round per message'}
          </span>
        </label>
        <span className="kicker">{running && round ? `round ${round.round}/${round.of}` : 'enter to send · shift+enter newline'}</span>
      </div>
    </div>
  );
}
