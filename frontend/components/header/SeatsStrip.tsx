'use client';

import { useAgentStore } from '@/hooks/useAgentState';
import { useLens } from '@/hooks/useLens';
import { Ocellus } from '@/components/shared/Ocellus';

/** Presence row: every resident, their state, click to watch their tab. */
export function SeatsStrip() {
  const roster = useAgentStore((s) => s.roster);
  const seated = useAgentStore((s) => s.seated);
  const seatStates = useAgentStore((s) => s.seatStates);
  const focusLens = useLens((s) => s.focus);
  const tabs = useLens((s) => s.tabs);
  const lensFocused = useLens((s) => s.focused);

  return (
    <div className="hidden lg:flex items-center gap-1 min-w-0 overflow-hidden">
      {roster.map((seat) => {
        const st = seatStates[seat.id];
        const on = seated.includes(seat.id);
        const hasTab = tabs.some((t) => t.agent === seat.id);
        const watching = lensFocused === seat.id;
        return (
          <button
            key={seat.id}
            onClick={() => hasTab && focusLens(seat.id)}
            className="group flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full transition-colors"
            style={{ background: watching ? `${seat.color}14` : 'transparent', cursor: hasTab ? 'pointer' : 'default' }}
            title={`${seat.name} — ${seat.temperament}${hasTab ? '\nClick to watch their tab' : ''}`}
          >
            <Ocellus size={20} tone={st === 'thinking' || st === 'executing' ? undefined : seat.color}
              state={st === 'thinking' ? 'thinking' : st === 'executing' ? 'executing' : 'watching'} muted={!on} />
            <span className="text-[12.5px] display italic" style={{ color: on ? seat.color : '#4d514a' }}>{seat.name}</span>
            {(st === 'thinking' || st === 'executing') && <span className="w-1 h-1 rounded-full breathe" style={{ background: seat.color }} />}
          </button>
        );
      })}
    </div>
  );
}
