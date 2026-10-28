import ReactMarkdown, { type Components } from 'react-markdown';
import { RotateCw } from 'lucide-react';
import { Badge, Button } from '../ui';
import { cn } from '../../lib/cn';
import { Avatar } from './Avatar';
import type { ChatMessage } from './types';

const markdownComponents: Components = {
  p: ({ node: _n, ...props }) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  ul: ({ node: _n, ...props }) => <ul className="my-2 list-disc pl-5 first:mt-0 last:mb-0" {...props} />,
  ol: ({ node: _n, ...props }) => <ol className="my-2 list-decimal pl-5 first:mt-0 last:mb-0" {...props} />,
  li: ({ node: _n, ...props }) => <li className="my-0.5" {...props} />,
  strong: ({ node: _n, ...props }) => <strong className="font-semibold" {...props} />,
  a: ({ node: _n, ...props }) => (
    <a className="text-accent-ink underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  h1: ({ node: _n, ...props }) => <p className="my-2 font-semibold" {...props} />,
  h2: ({ node: _n, ...props }) => <p className="my-2 font-semibold" {...props} />,
  h3: ({ node: _n, ...props }) => <p className="my-2 font-semibold" {...props} />,
  code: ({ node: _n, ...props }) => <code className="rounded bg-sunken px-1 py-0.5 text-[0.9em]" {...props} />,
};

export interface MessageBubbleProps {
  message: ChatMessage;
  showCategory?: boolean;
  onRetry?: (message: ChatMessage) => void;
  retryDisabled?: boolean;
}

export function MessageBubble({ message, showCategory = true, onRetry, retryDisabled }: MessageBubbleProps) {
  if (message.role === 'user') {
    const failed = message.status === 'failed';
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className={cn(
            'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-base text-white shadow-sm',
            failed && 'opacity-70',
          )}
        >
          {message.content}
        </div>
        {failed && message.failure === 'no-document' && (
          <p className="text-xs text-red-700">Not sent: the knowledge base is not available yet.</p>
        )}
        {failed && message.failure === 'unavailable' && (
          <div className="flex flex-wrap items-center justify-end gap-1 text-xs text-red-700">
            <span>{"Couldn't reach the assistant —"}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-red-700 hover:bg-red-50"
              onClick={() => onRetry?.(message)}
              disabled={retryDisabled}
              aria-label="Retry sending this message"
            >
              <RotateCw className="size-3" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <Avatar />
      <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1.5">
        <div className="break-words rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 text-base text-ink shadow-sm">
          <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
        </div>
        {showCategory && message.category && (
          <Badge tone="neutral" className="ml-1 text-[11px] font-normal text-muted">
            {message.category}
          </Badge>
        )}
      </div>
    </div>
  );
}
