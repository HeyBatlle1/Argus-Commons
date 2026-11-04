'use client';

import { ArgusEye } from './ArgusEye';
import { ConnectionStatus } from './ConnectionStatus';
import { ModelSelector } from './ModelSelector';
import { SentryDropdown } from './SentryDropdown';
import { SeatsStrip } from './SeatsStrip';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 h-[58px] flex items-center justify-between gap-4 px-5 border-b border-argus-border"
      style={{ background: 'rgba(11,13,12,0.86)', backdropFilter: 'blur(8px)' }}>
      {/* Wordmark */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <ArgusEye />
        <div className="flex flex-col leading-none">
          <span className="display text-[24px] italic text-argus-textBright" style={{ fontWeight: 420 }}>Argus</span>
          <span className="kicker mt-1 !text-[8.5px]">Panoptes · the hundred eyes</span>
        </div>
      </div>

      {/* Who's here */}
      <SeatsStrip />

      {/* Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <ConnectionStatus />
        <SentryDropdown />
        <ModelSelector />
      </div>
    </header>
  );
}
