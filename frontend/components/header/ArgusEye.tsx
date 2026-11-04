'use client';

import { useAgentStore } from '@/hooks/useAgentState';
import { Ocellus } from '@/components/shared/Ocellus';
import { EYE_LABELS } from '@/lib/constants';

/** Header status mark. Was a glowing orb; now the ocellus — state in the iris. */
export function ArgusEye() {
  const eyeState = useAgentStore((s) => s.eyeState);
  return <Ocellus size={34} state={eyeState} title={`Argus — ${EYE_LABELS[eyeState]}`} />;
}
