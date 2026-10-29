import ReactMarkdown, { type Components } from 'react-markdown';
import { RotateCw } from 'lucide-react';
import { Badge, Button } from '../ui';
import { cn } from '../../lib/cn';
import type { ChatMessage } from './types';

const markdownComponents: Components = {
  p: ({ node: _n, ...props }) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  ul: ({ node: _n, ...props }) => <ul className="my-2 list-disc pl-5 first:mt-0 last:mb-0" {...props} />,
  ol: ({ node: _n, ...props }) => <ol className="my-2 list-decimal pl-5 first:mt-0 last:mb-0" {...props} />,
  li: ({ node: _n, ...props }) => <li className="my-0.5" {...props} />,
  strong: ({ node: _n, ...props }) => <strong className="font-bold" {...props} />,
  a: ({ node: _n, ...props }) => (
    <a
      className="font-medium underline decoration-slip-muted underline-offset-[3px] hover:decoration-slip-ink"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  h1: ({ node: _n, ...props }) => <p className="my-2 font-bold" {...props} />,
  h2: ({ node: _n, ...props }) => <p className="my-2 font-bold" {...props} />,
  h3: ({ node: _n, ...props }) => <p className="my-2 font-bold" {...props} />,
  code: ({ node: _n, ...props }) => <code className="rounded-[2px] bg-slip-rule px-1 py-0.5 text-[0.9em]" {...props} />,
};

/** "CONCIERGE · 2:14 PM" line above each entry, like a row on the enquiry log. */
function EntryLabel({ who, iso, className }: { who: string; iso?: string; className?: string }) {
  const d = iso ? new Date(iso) : null;
  const valid = d !== null && !Number.isNaN(d.getTime());
  return (
    <p className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted', className)}>
      <span>{who}</span>
      {valid && (
        <time dateTime={iso} title={d.toLocaleString()} className="font-medium normal-case tracking-normal">
          {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </time>
      )}
    </p>
  );
}

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Guests never see the internal category; kept for staff-facing reuse. */
  showCategory?: boolean;
  onRetry?: (message: ChatMessage) => void;
  retryDisabled?: boolean;
}

export function MessageBubble({ message, showCategory = false, onRetry, retryDisabled }: MessageBubbleProps) {
  if (message.role === 'user') {
    const failed = message.status === 'failed';
    return (
      <div className="flex flex-col items-end gap-1.5">
        <EntryLabel who="You" iso={failed ? undefined : message.createdAt} className="mr-0.5" />
        <div
          className={cn(
            'max-w-[85%] whitespace-pre-wrap break-words rounded-slat border border-rule-strong bg-slat-2 px-4 py-2.5 text-base text-flap',
            failed && 'border-stop/60 text-dim',
          )}
        >
          {message.content}
        </div>
        {failed && message.failure === 'no-document' && (
          <p className="text-sm text-stop">Not sent: the knowledge base is not available yet.</p>
        )}
        {failed && (message.failure === 'unavailable' || message.failure === 'rate-limited') && (
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-stop">
            <span>
              {message.failure === 'rate-limited'
                ? "You're sending messages too quickly. Wait a moment and try again."
                : "Couldn't reach the assistant."}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRetry?.(message)}
              disabled={retryDisabled}
              aria-label="Retry sending this message"
            >
              <RotateCw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <EntryLabel who="Concierge" iso={message.createdAt} className="ml-0.5" />
      <div className="max-w-[85%] break-words rounded-slat bg-slip px-4 py-3 text-base leading-relaxed text-slip-ink shadow-[0_2px_8px_rgb(0_0_0/0.35)]">
        <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
      </div>
      {showCategory && message.category && <Badge tone="neutral">{message.category}</Badge>}
    </div>
  );
}
