import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ContactFormCard } from './ContactFormCard';
import { isNearBottom } from '../../lib/chat';
import type { Announcement, ChatMessage, ContactOffer, LeadDetails } from './types';

export interface MessageListProps {
  messages: ChatMessage[];
  pending: boolean;
  sessionId: string | null;
  offers: Record<string, ContactOffer>;
  savedLead: LeadDetails | null;
  onLeadSubmit: (key: string, details?: LeadDetails) => Promise<void>;
  onOfferDismiss: (key: string) => void;
  onRetry: (message: ChatMessage) => void;
  /** What the polite live region reads out (new answers, send failures). */
  announcement: Announcement | null;
  /** Rendered after the messages (e.g. suggestion chips). */
  footer?: ReactNode;
}

const ENTRY_GAP_PX = 12;

export function MessageList({
  messages,
  pending,
  sessionId,
  offers,
  savedLead,
  onLeadSubmit,
  onOfferDismiss,
  onRetry,
  announcement,
  footer,
}: MessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const entryRefs = useRef(new Map<string, HTMLDivElement>());
  // Whether the reader was at (or near) the latest entry before this update; tracked from scroll events.
  const nearBottomRef = useRef(true);
  const lastKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const isNew = !!last && last.key !== lastKeyRef.current;
    const firstPaint = lastKeyRef.current === null;
    lastKeyRef.current = last?.key ?? null;
    const behavior: ScrollBehavior =
      firstPaint || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const toBottom = () => el.scrollTo({ top: el.scrollHeight, behavior });

    if (isNew && last.role === 'user') {
      // The guest's own entry always comes into view.
      toBottom();
    } else if (isNew && last.role === 'assistant') {
      if (!nearBottomRef.current && !firstPaint) return;
      // Bring the top of the answer into view so a long slip is read from its first line.
      const entry = entryRefs.current.get(last.key);
      if (!entry || firstPaint) {
        toBottom();
        return;
      }
      const top = entry.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - ENTRY_GAP_PX;
      el.scrollTo({ top: Math.min(top, el.scrollHeight - el.clientHeight), behavior });
    } else if (pending && nearBottomRef.current) {
      // Typing indicator (also on retry): follow it only if the reader is already at the bottom.
      toBottom();
    }
  }, [messages, pending]);

  return (
    <div
      ref={scrollerRef}
      className="flex flex-1 flex-col overflow-y-auto"
      onScroll={(e) => {
        nearBottomRef.current = isNearBottom(e.currentTarget);
      }}
    >
      {/* Only message text is announced (via the region below); the contact form stays out of the live log. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement && <p key={announcement.id}>{announcement.text}</p>}
      </div>
      {/* mt-auto anchors a short conversation to the composer instead of leaving a void above it. */}
      <div
        role="log"
        aria-live="off"
        aria-label="Conversation"
        className="mx-auto mt-auto flex w-full max-w-[760px] flex-col gap-5 px-4 py-6 sm:px-6"
      >
        {messages.map((m) => {
          const offer = offers[m.key];
          return (
            <div
              key={m.key}
              ref={(node) => {
                if (node) entryRefs.current.set(m.key, node);
                else entryRefs.current.delete(m.key);
              }}
              className="animate-slip-in flex flex-col gap-3"
            >
              <MessageBubble message={m} onRetry={onRetry} retryDisabled={pending} />
              {offer && offer.state !== 'dismissed' && sessionId && (
                <div>
                  <ContactFormCard
                    offer={offer}
                    savedLead={savedLead}
                    onSubmit={(details) => onLeadSubmit(m.key, details)}
                    onDismiss={() => onOfferDismiss(m.key)}
                  />
                </div>
              )}
            </div>
          );
        })}
        {pending && <TypingIndicator />}
        {footer}
      </div>
    </div>
  );
}
