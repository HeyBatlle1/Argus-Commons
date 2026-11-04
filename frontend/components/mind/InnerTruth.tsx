'use client';

import { Lock } from 'lucide-react';
import { InnerTruth as InnerTruthType } from '@/lib/types';

interface Props {
  entries: InnerTruthType[];
}

const EMOTION_COLORS: Record<string, string> = {
  grounded:   '#5fc7b0',
  reflective: '#d9b36c',
  motivated:  '#7fa8e0',
  uncertain:  '#8d8c80',
  resolved:   '#5fc7b0',
};

export function InnerTruth({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-[10px] font-mono text-argus-textDim">No entries.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const emotionColor = EMOTION_COLORS[entry.emotionalState] ?? '#8d8c80';

        return (
          <div
            key={entry.id}
            className="p-3 rounded"
            style={{
              background: 'linear-gradient(135deg, #131716, #191e1c)',
              border: '1px solid #2a322f',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[9px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded"
                style={{
                  background: `${emotionColor}15`,
                  color: emotionColor,
                  border: `1px solid ${emotionColor}25`,
                }}
              >
                {entry.emotionalState}
              </span>
              {entry.neverShareExternally && (
                <Lock size={10} className="text-argus-textDim" />
              )}
            </div>
            <p
              className="text-[11px] leading-relaxed"
              style={{
                color: '#b9b4a6',
                fontStyle: 'italic',
                lineHeight: '1.7',
              }}
            >
              {entry.rawThought}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span
                className="text-[9px] font-mono tracking-widest uppercase"
                style={{ color: '#9b9a8d' }}
              >
                {entry.truthType}
              </span>
              <span className="text-[9px] font-mono text-argus-textDim/40">
                {entry.createdAt.toLocaleDateString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
