'use client';

import { Message } from '@/lib/types';

interface Props {
  message: Message;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function UserMessage({ message }: Props) {
  return (
    <div className="flex justify-end animate-fade-in">
      <div className="max-w-[72%]">
        <div
          className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-[14px] leading-relaxed text-argus-textBright"
          style={{ background: '#191e1c', border: '1px solid #2a322f' }}
        >
          {message.content}
        </div>
        <div className="flex justify-end mt-1 px-1">
          <span className="text-[10px] font-mono text-argus-textDim">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
