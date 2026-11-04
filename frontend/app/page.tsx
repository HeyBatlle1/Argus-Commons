'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Header } from '@/components/header/Header';
import { EyesPanel } from '@/components/eyes/EyesPanel';
import { MindPanel } from '@/components/mind/MindPanel';
import { ArtifactPanel } from '@/components/artifacts/ArtifactPanel';
import { Lens } from '@/components/lens/Lens';
import { Stage } from '@/components/commons/Stage';
import { Artifact } from '@/lib/types';

const SPLIT_KEY = 'argus.lensSplit';

export default function Home() {
  const [artifactState, setArtifactState] = useState<{
    artifacts: Artifact[];
    index: number;
  } | null>(null);

  function openArtifact(artifacts: Artifact[], index: number) {
    setArtifactState({ artifacts, index });
  }

  function closeArtifact() {
    setArtifactState(null);
  }

  // Lens / Stage split — fraction of the centre column given to the Lens.
  const [split, setSplit] = useState(0.56);
  const centre = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    try { const v = Number(localStorage.getItem(SPLIT_KEY)); if (v > 0.2 && v < 0.85) setSplit(v); } catch { /* ignore */ }
  }, []);

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !centre.current) return;
    const r = centre.current.getBoundingClientRect();
    const f = Math.min(0.8, Math.max(0.24, (e.clientY - r.top) / r.height));
    setSplit(f);
  }, []);
  const onUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    setSplit((f) => { try { localStorage.setItem(SPLIT_KEY, String(f)); } catch { /* ignore */ } return f; });
  }, []);
  useEffect(() => {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [onMove, onUp]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      <main className="flex flex-1 overflow-hidden" style={{ paddingTop: '58px' }}>
        <EyesPanel />

        {/* Centre: the Lens is always on screen; the Stage lives under it */}
        <div ref={centre} className="flex-1 min-w-[460px] flex flex-col border-x border-argus-border">
          <div style={{ height: `${split * 100}%` }} className="min-h-[200px]">
            <Lens />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Drag to resize the Lens"
            onPointerDown={() => { dragging.current = true; document.body.style.cursor = 'row-resize'; }}
            onDoubleClick={() => setSplit(0.56)}
            className="group h-2 -my-1 relative z-10 cursor-row-resize flex items-center justify-center flex-shrink-0"
          >
            <span className="w-full h-px bg-argus-border group-hover:bg-argus-amberDim transition-colors" />
            <span className="absolute w-10 h-1 rounded-full bg-argus-borderBright group-hover:bg-argus-amber transition-colors" />
          </div>
          <div className="flex-1 min-h-[220px]">
            <Stage onOpenArtifact={openArtifact} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {artifactState ? (
            <div key="artifact" className="w-[min(46vw,760px)] flex-shrink-0 overflow-hidden">
              <ArtifactPanel
                artifacts={artifactState.artifacts}
                initialIndex={artifactState.index}
                onClose={closeArtifact}
              />
            </div>
          ) : (
            <MindPanel key="mind" />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
