'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Layers } from 'lucide-react';
import { Message, Artifact } from '@/lib/types';
import { artifactLabel } from '@/lib/artifacts';

interface Props {
  message: Message;
  onOpenArtifact?: (artifacts: Artifact[], index: number) => void;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ArgusMessage({ message, onOpenArtifact }: Props) {
  if (!message.content && !message.artifacts?.length) return null;

  const artifacts = message.artifacts ?? [];

  return (
    <div className="animate-fade-in">
      {message.content && (
        <div className="argus-prose text-argus-text text-sm leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className ?? '');
                const isBlock = match !== null;
                if (isBlock) {
                  return (
                    <SyntaxHighlighter
                      style={dracula}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: '0.75em 0',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: '#0f1211',
                        border: '1px solid #2a322f',
                      }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  );
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {/* Artifact buttons */}
      {artifacts.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {artifacts.map((artifact, i) => (
            <button
              key={artifact.id}
              onClick={() => onOpenArtifact?.(artifacts, i)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono transition-all"
              style={{
                background: '#131716',
                border: '1px solid #36403c',
                color: '#c9bf9f',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#191e1c';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#a6854b';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#131716';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#36403c';
              }}
            >
              <Layers size={11} />
              <span>{artifact.title}</span>
              <span
                className="text-[9px] px-1 py-0.5 rounded"
                style={{ background: '#191e1c', color: '#a6854b' }}
              >
                {artifactLabel(artifact.type)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-1.5">
        <span className="text-[10px] font-mono text-argus-textDim">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
