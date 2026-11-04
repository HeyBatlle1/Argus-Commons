'use client';

import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { Artifact } from '@/lib/types';

interface Props {
  onOpenArtifact: (artifacts: Artifact[], index: number) => void;
}

/** Solo conversation with Argus. Header now lives in <Stage/>; the logo
 *  watermark is gone — the Lens took the centre of the room. */
export function ConversationPanel({ onOpenArtifact }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0 flex flex-col">
        <MessageList onOpenArtifact={onOpenArtifact} />
      </div>
      <InputArea />
    </div>
  );
}
