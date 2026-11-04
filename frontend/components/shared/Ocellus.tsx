'use client';

/**
 * The ocellus — the "eye" on a peacock feather, where Hera put Argus's eyes.
 * Replaces the old glowing orb glyph. State shows in the iris colour and the
 * pupil; nothing flashes. `tone` overrides the iris colour (seat colours).
 */

import { EyeState } from '@/lib/types';

const IRIS: Record<EyeState, string> = {
  watching: '#5fc7b0',
  thinking: '#d9b36c',
  executing: '#7fa8e0',
  complete: '#f4efe2',
};

interface Props {
  size?: number;
  state?: EyeState;
  tone?: string;
  /** dim the whole mark (seat not in the room) */
  muted?: boolean;
  className?: string;
  title?: string;
}

export function Ocellus({ size = 28, state = 'watching', tone, muted, className = '', title }: Props) {
  const iris = tone ?? IRIS[state];
  const pupil = state === 'thinking' ? 2.6 : state === 'executing' ? 4.2 : 3.4;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      style={{ opacity: muted ? 0.32 : 1, transition: 'opacity .2s' }}
      role="img"
      aria-label={title ?? `eye ${state}`}
    >
      {title && <title>{title}</title>}
      {/* feather vane */}
      <ellipse cx="16" cy="16" rx="15" ry="15.5" fill="none" stroke="#2e8f87" strokeOpacity="0.55" strokeWidth="0.8" />
      <ellipse cx="16" cy="16" rx="12.2" ry="12.8" fill="#123532" fillOpacity="0.55" />
      {/* bronze ring */}
      <ellipse cx="16" cy="16.4" rx="9.4" ry="10" fill="#6b5328" fillOpacity="0.9" />
      {/* iris */}
      <ellipse cx="16" cy="16.8" rx="7" ry="7.4" fill={iris} style={{ transition: 'fill .35s' }} />
      {/* pupil — dilates with state */}
      <circle cx="16" cy="17.2" r={pupil} fill="#0b0d0c" style={{ transition: 'r .35s' }} />
      {/* catchlight */}
      <circle cx="13.6" cy="14.4" r="1.1" fill="#fff8e6" fillOpacity="0.8" />
    </svg>
  );
}
