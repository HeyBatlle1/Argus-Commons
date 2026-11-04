'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAgentStore } from '@/hooks/useAgentState';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { EyeStateIndicator } from '@/components/shared/EyeStateIndicator';
import { ToolStatus } from './ToolStatus';
import { PanelTitle } from '@/components/shared/PanelTitle';
import { Ocellus } from '@/components/shared/Ocellus';
import { MiniCalendar } from '@/components/calendar/MiniCalendar';
import { useLocalSchedule } from '@/hooks/useLocalSchedule';
import { VaultStatus } from './VaultStatus';
import { SystemInfo } from './SystemInfo';
import { EYE_LABELS } from '@/lib/constants';
import { modelConfig } from '@/lib/models';

export function EyesPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const eyeState = useAgentStore((s) => s.eyeState);
  const activeModel = useAgentStore((s) => s.activeModel);
  const tools = useAgentStore((s) => s.tools);
  const startTime = useAgentStore((s) => s.startTime);
  const vaultKeys = useAgentStore((s) => s.vaultKeys);
  const mcpServers = useAgentStore((s) => s.mcpServers);
  const connected = useAgentStore((s) => s.connected);

  const modelCfg = modelConfig(activeModel);
  const roster = useAgentStore((s) => s.roster);
  const seated = useAgentStore((s) => s.seated);
  const seatStates = useAgentStore((s) => s.seatStates);
  const schedule = useLocalSchedule();

  return (
    <motion.div
      animate={{ width: collapsed ? 36 : 252 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="relative h-full border-r border-argus-border flex-shrink-0 overflow-hidden"
      style={{ background: 'rgba(15,18,17,0.6)' }}
    >
      {/* Collapsed strip */}
      <AnimatePresence>
        {collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center pt-4 gap-3"
          >
            <button
              onClick={() => setCollapsed(false)}
              className="text-argus-textDim hover:text-argus-amber transition-colors"
            >
              <ChevronLeft size={14} className="rotate-180" />
            </button>
            <EyeStateIndicator state={eyeState} size="sm" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full panel */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col overflow-y-auto"
          >
            <PanelTitle
              numeral="I"
              title="The Eyes"
              right={
                <button onClick={() => setCollapsed(true)} className="text-argus-textDim hover:text-argus-amber transition-colors" title="Collapse">
                  <ChevronLeft size={14} />
                </button>
              }
            />

            {/* Agent Status */}
            <CollapsibleSection title="Agent Status" defaultOpen={true}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <EyeStateIndicator state={eyeState} size="sm" showLabel={true} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono tracking-widest uppercase text-argus-textDim">MODEL</span>
                  <span className="text-[11px] font-mono text-argus-amber">{modelCfg.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono tracking-widest uppercase text-argus-textDim">TIER</span>
                  <span className="text-[11px] font-mono" style={{ color: modelCfg.color }}>
                    {modelCfg.icon} {modelCfg.tierLabel}
                  </span>
                </div>
              </div>
            </CollapsibleSection>

            {/* Residents — who lives in the Commons */}
            <CollapsibleSection title="Residents" defaultOpen={true} count={roster.length}>
              <div className="space-y-1.5">
                {roster.map((seat) => {
                  const on = seated.includes(seat.id);
                  const st = seatStates[seat.id];
                  return (
                    <div key={seat.id} className="flex items-center gap-2" title={seat.temperament}>
                      <Ocellus size={18} tone={seat.color} muted={!on} state={st === 'thinking' ? 'thinking' : st === 'executing' ? 'executing' : 'watching'} />
                      <span className="text-[12px] display italic" style={{ color: on ? seat.color : '#64675f' }}>{seat.name}</span>
                      <span className="ml-auto text-[9.5px] font-mono text-argus-textFaint truncate max-w-[110px]">{modelConfig(seat.model).name}</span>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            {/* Active Tools */}
            <CollapsibleSection title="Active Tools" defaultOpen={true} count={tools.length}>
              <div className="divide-y divide-argus-border/30">
                {tools.map((tool) => (
                  <ToolStatus key={tool.name} tool={tool} />
                ))}
              </div>
            </CollapsibleSection>

            {/* Vault */}
            <CollapsibleSection title="Vault" defaultOpen={true}>
              <VaultStatus
                locked={!connected}
                keys={vaultKeys}
              />
            </CollapsibleSection>

            {/* MCP Servers */}
            <CollapsibleSection title="MCP Servers" defaultOpen={false} count={mcpServers.length}>
              {mcpServers.length === 0 ? (
                <p className="text-[10px] font-mono text-argus-textDim">No servers connected.</p>
              ) : (
                <div className="space-y-1">
                  {mcpServers.map((name) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-argus-greenLight flex-shrink-0" />
                      <span className="text-[10px] font-mono text-argus-textDim truncate">{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Calendar — the 2×2 spec from IDENTITY_GOVERNANCE.md, finally mounted */}
            <CollapsibleSection title="Calendar" defaultOpen={false} count={schedule.count}>
              <MiniCalendar data={schedule.data} onAddTask={schedule.add} />
              <p className="mt-2 text-[10px] text-argus-textFaint leading-snug">
                Hover a day, type, Enter. Stored in this browser — the daemon has no schedule endpoint yet.
              </p>
            </CollapsibleSection>

            {/* System */}
            <CollapsibleSection title="System" defaultOpen={false}>
              <SystemInfo />
            </CollapsibleSection>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
