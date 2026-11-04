'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useAgentStore } from '@/hooks/useAgentState';
import { MODELS_IN_ORDER, modelConfig } from '@/lib/models';
import { TierBadge } from '@/components/shared/TierBadge';
import { ModelId } from '@/lib/types';

/** Solo-mode engine picker. Open weights only — local (Royal) and hosted (Allied). */
export function ModelSelector() {
  const [open, setOpen] = useState(false);
  const activeModel = useAgentStore((s) => s.activeModel);
  const switchModel = useAgentStore((s) => s.switchModel);
  const cfg = modelConfig(activeModel);

  const royalModels = MODELS_IN_ORDER.filter((m) => modelConfig(m).tier === 'royal');
  const alliedModels = MODELS_IN_ORDER.filter((m) => modelConfig(m).tier === 'allied');

  function select(id: ModelId) {
    switchModel(id);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-full border border-argus-border hover:border-argus-amberDim transition-colors"
        title="Engine for solo Argus (Commons seats bring their own)"
      >
        <span className="kicker !text-[9px]">engine</span>
        <span className="text-[12px] font-mono text-argus-textBright tracking-wide">{cfg.name}</span>
        <TierBadge tier={cfg.tier} />
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-argus-textDim">
          <ChevronDown size={12} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 top-full mt-2 z-50 w-[320px] rounded-xl border border-argus-borderBright bg-argus-bg2 shadow-2xl overflow-hidden"
            >
              <Group title="Royal · local" sub="Ollama on your hardware — nothing leaves the machine" color="#d9b36c">
                {royalModels.map((id) => <ModelOption key={id} id={id} active={id === activeModel} onSelect={select} />)}
              </Group>
              <div className="border-t border-argus-border" />
              <Group title="Allied · open weights" sub="Hosted on OpenRouter — weights verified public at launch" color="#5fc7b0">
                {alliedModels.map((id) => <ModelOption key={id} id={id} active={id === activeModel} onSelect={select} />)}
              </Group>
              <div className="px-4 py-2 border-t border-argus-border text-[10px] text-argus-textFaint leading-snug">
                No closed models. Add more in <span className="font-mono text-argus-textDim">infra/litellm/config.yaml</span>.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Group({ title, sub, color, children }: { title: string; sub: string; color: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-2">
      <div className="px-1 mb-1.5">
        <div className="display italic text-[14px]" style={{ color }}>{title}</div>
        <div className="text-[10px] text-argus-textFaint">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function ModelOption({ id, active, onSelect }: { id: ModelId; active: boolean; onSelect: (id: ModelId) => void }) {
  const m = modelConfig(id);
  return (
    <button
      onClick={() => onSelect(id)}
      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors mb-0.5 ${
        active ? 'bg-argus-amber/10' : 'hover:bg-white/[0.035]'
      }`}
    >
      <span className="flex flex-col">
        <span className={`text-[12.5px] font-mono ${active ? 'text-argus-amber' : 'text-argus-text'}`}>{m.name}</span>
        <span className="text-[9.5px] font-mono text-argus-textFaint">{m.upstream} · {m.note}</span>
      </span>
      {active && <span className="kicker !text-argus-amber">active</span>}
    </button>
  );
}
