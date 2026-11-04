'use client';

import { motion } from 'framer-motion';
import { Tool } from '@/lib/types';

interface Props {
  tool: Tool;
}

const STATE_COLOR = {
  idle:     '#2a322f',
  active:   '#7fa8e0',
  complete: '#5fc7b0',
  error:    '#e5624f',
};

const STATE_GLOW = {
  idle:     'none',
  active:   '0 0 6px rgba(127,168,224,0.7)',
  complete: '0 0 6px rgba(95,199,176,0.5)',
  error:    '0 0 6px rgba(229,98,79,0.7)',
};

export function ToolStatus({ tool }: Props) {
  const color = STATE_COLOR[tool.state];
  const glow = STATE_GLOW[tool.state];

  return (
    <div className="flex items-center justify-between py-1 group">
      <div className="flex items-center gap-2">
        {/* State dot */}
        <motion.span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: color, boxShadow: glow }}
          animate={
            tool.state === 'active'
              ? { opacity: [1, 0.3, 1], boxShadow: [STATE_GLOW.active, '0 0 12px rgba(127,168,224,0.9)', STATE_GLOW.active] }
              : {}
          }
          transition={tool.state === 'active' ? { duration: 0.8, repeat: Infinity } : {}}
        />
        <span className="text-[11px] font-mono text-argus-textDim group-hover:text-argus-text transition-colors">
          {tool.label}
        </span>
      </div>
      {tool.callCount > 0 && (
        <span className="text-[9px] font-mono text-argus-textDim bg-white/5 px-1 rounded">
          {tool.callCount}
        </span>
      )}
    </div>
  );
}
