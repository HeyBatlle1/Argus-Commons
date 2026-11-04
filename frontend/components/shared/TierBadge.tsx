'use client';

import { AccessTier } from '@/lib/types';

interface Props {
  tier: AccessTier;
  className?: string;
}

// Royal = local weights (data stays home). Allied = hosted open weights.
const TIER_CONFIG = {
  royal:  { label: 'ROYAL',  icon: '◆', bg: 'rgba(217,179,108,0.10)', color: '#d9b36c', border: 'rgba(217,179,108,0.32)', title: 'Local model — prompts never leave this machine. Full Mind access.' },
  allied: { label: 'ALLIED', icon: '◇', bg: 'rgba(95,199,176,0.08)',  color: '#5fc7b0', border: 'rgba(95,199,176,0.28)',  title: 'Open weights hosted on OpenRouter — prompts leave the machine. Limited Mind access.' },
  guest:  { label: 'GUEST',  icon: '○', bg: 'rgba(141,140,128,0.08)', color: '#8d8c80', border: 'rgba(141,140,128,0.2)',  title: 'Read-only.' },
};

export function TierBadge({ tier, className = '' }: Props) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      title={cfg.title}
      className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full text-[9px] font-mono tracking-[0.12em] ${className}`}
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}
