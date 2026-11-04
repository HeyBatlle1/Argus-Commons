'use client';

import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/hooks/useAgentState';
import { UserMessage } from './UserMessage';
import { ArgusMessage } from './ArgusMessage';
import { ToolCallBlock } from './ToolCallBlock';
import { Artifact } from '@/lib/types';

interface Props {
  onOpenArtifact: (artifacts: Artifact[], index: number) => void;
}

export function MessageList({ onOpenArtifact }: Props) {
  const messages = useAgentStore((s) => s.messages);
  const streamingContent = useAgentStore((s) => s.streamingContent);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {messages.length === 0 && !isStreaming && (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <p className="display italic text-[22px] text-argus-textBright">Just you and Argus.</p>
          <p className="mt-2 max-w-[420px] text-[13px] leading-relaxed text-argus-textDim">
            One agent, your chosen engine, full tools. If it opens a page you’ll watch it in the Lens above.
          </p>
        </div>
      )}
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return <UserMessage key={msg.id} message={msg} />;
        }
        return (
          <div key={msg.id}>
            {msg.toolCalls?.map((tc) => (
              <ToolCallBlock key={tc.id} toolCall={tc} />
            ))}
            {(msg.content || msg.artifacts?.length) ? (
              <ArgusMessage
                message={msg}
                onOpenArtifact={onOpenArtifact}
              />
            ) : null}
          </div>
        );
      })}

      {isStreaming && streamingContent && (
        <div className="animate-fade-in">
          <div className="argus-prose text-argus-text text-sm leading-relaxed whitespace-pre-wrap">
            {streamingContent}
            <span className="inline-block w-1.5 h-4 bg-argus-amber ml-0.5 animate-pulse-rapid align-bottom" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
