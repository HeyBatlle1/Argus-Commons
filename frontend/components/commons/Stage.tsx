'use client';

import { useAgentStore } from '@/hooks/useAgentState';
import { PanelTitle } from '@/components/shared/PanelTitle';
import { CommonsPanel } from './CommonsPanel';
import { ConversationPanel } from '@/components/conversation/ConversationPanel';
import { Artifact } from '@/lib/types';

/** The lower half of the centre column: the Commons (group) or Argus solo. */
export function Stage({ onOpenArtifact }: { onOpenArtifact: (a: Artifact[], i: number) => void }) {
  const stage = useAgentStore((s) => s.stage);
  const setStage = useAgentStore((s) => s.setStage);
  const running = useAgentStore((s) => s.roomRunning);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const seated = useAgentStore((s) => s.seated.length);

  return (
    <section className="flex flex-col h-full min-h-0">
      <PanelTitle
        numeral="II"
        title={stage === 'commons' ? 'The Commons' : 'Argus, alone'}
        kicker={stage === 'commons' ? `${seated} seated${running ? ' · in session' : ''}` : 'solo conversation'}
        right={
          <div className="flex rounded-full border border-argus-border p-0.5" role="tablist">
            {(['commons', 'solo'] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={stage === k}
                onClick={() => setStage(k)}
                className="px-3 py-1 rounded-full text-[10px] font-mono tracking-[0.14em] uppercase transition-colors"
                style={stage === k ? { background: '#d9b36c', color: '#17130b' } : { color: '#9b9a8d' }}
              >
                {k === 'commons' ? 'Commons' : 'Solo'}
                {k === 'commons' && running && stage !== 'commons' && <span className="ml-1.5 text-argus-amber">●</span>}
                {k === 'solo' && isStreaming && stage !== 'solo' && <span className="ml-1.5 text-argus-amber">●</span>}
              </button>
            ))}
          </div>
        }
      />
      <div className="flex-1 min-h-0">
        {/* both stay mounted so in-flight state and scroll survive switching */}
        <div className={stage === 'commons' ? 'h-full' : 'hidden'}><CommonsPanel onOpenArtifact={onOpenArtifact} /></div>
        <div className={stage === 'solo' ? 'h-full' : 'hidden'}><ConversationPanel onOpenArtifact={onOpenArtifact} /></div>
      </div>
    </section>
  );
}
