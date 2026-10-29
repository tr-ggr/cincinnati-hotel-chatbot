import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RotateCw } from 'lucide-react';
import { Button } from '../ui';
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
  // Fenced blocks: the slip-rule ground moves to the <pre>, the inner <code> drops its inline chrome.
  pre: ({ node: _n, ...props }) => (
    <pre
      className="my-2 overflow-x-auto rounded-[2px] bg-slip-rule p-3 text-[0.9em] leading-snug first:mt-0 last:mb-0 [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
  // remark-gfm tables (hotel guides love rate and opening-hours tables); the wrapper scrolls on phones.
  table: ({ node: _n, ...props }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-[0.9375rem] leading-snug" {...props} />
    </div>
  ),
  th: ({ node: _n, ...props }) => (
    <th className="border-b-2 border-slip-rule px-2 py-1.5 text-left align-bottom font-bold" {...props} />
  ),
  td: ({ node: _n, ...props }) => <td className="border-b border-slip-rule px-2 py-1.5 align-top" {...props} />,
};

const remarkPlugins = [remarkGfm];

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
  onRetry?: (message: ChatMessage) => void;
  retryDisabled?: boolean;
}

const FAILURE_COPY: Record<NonNullable<ChatMessage['failure']>, string> = {
  'no-document': "Not sent: our concierge isn't available yet.",
  'rate-limited': "You're sending messages too quickly. Wait a moment and try again.",
  unavailable: "Couldn't reach the assistant.",
};

export function failureCopy(failure: ChatMessage['failure']): string {
  return FAILURE_COPY[failure ?? 'unavailable'];
}

export function MessageBubble({ message, onRetry, retryDisabled }: MessageBubbleProps) {
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
        {failed && (
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-stop">
            <span>{failureCopy(message.failure)}</span>
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
        <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
