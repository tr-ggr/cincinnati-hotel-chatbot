import { useEffect, useRef, type ReactNode } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ContactFormCard } from './ContactFormCard';
import type { ChatMessage, ContactOffer } from './types';

export interface MessageListProps {
  messages: ChatMessage[];
  pending: boolean;
  sessionId: string | null;
  offers: Record<string, ContactOffer>;
  onOfferChange: (key: string, state: ContactOffer['state']) => void;
  onRetry: (message: ChatMessage) => void;
  /** Rendered after the messages (e.g. suggestion chips). */
  footer?: ReactNode;
}

export function MessageList({ messages, pending, sessionId, offers, onOfferChange, onRetry, footer }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' });
  }, [messages, pending, offers]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* mt-auto anchors a short conversation to the composer instead of leaving a void above it. */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="mx-auto mt-auto flex w-full max-w-[760px] flex-col gap-5 px-4 py-6 sm:px-6"
      >
        {messages.map((m) => {
          const offer = offers[m.key];
          return (
            <div key={m.key} className="animate-slip-in flex flex-col gap-3">
              <MessageBubble message={m} onRetry={onRetry} retryDisabled={pending} />
              {offer && offer.state !== 'dismissed' && sessionId && (
                <div>
                  <ContactFormCard
                    sessionId={sessionId}
                    question={offer.question}
                    done={offer.state === 'done'}
                    onDone={() => onOfferChange(m.key, 'done')}
                    onDismiss={() => onOfferChange(m.key, 'dismissed')}
                  />
                </div>
              )}
            </div>
          );
        })}
        {pending && <TypingIndicator />}
        {footer}
        <div ref={endRef} />
      </div>
    </div>
  );
}
