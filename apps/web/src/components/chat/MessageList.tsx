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
    <div className="flex-1 overflow-y-auto">
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5"
      >
        {messages.map((m) => {
          const offer = offers[m.key];
          return (
            <div key={m.key} className="animate-bubble-in flex flex-col gap-3">
              <MessageBubble message={m} onRetry={onRetry} retryDisabled={pending} />
              {offer && offer.state !== 'dismissed' && sessionId && (
                <div className="space-y-2 pl-10">
                  {offer.state === 'open' && (
                    <p className="text-sm text-ink-soft">
                      Would you like to leave your contact details so our team can get back to you?
                    </p>
                  )}
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
