import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Button } from '../ui';
import { fieldClasses } from '../ui/Input';
import { cn } from '../../lib/cn';
import { COMPOSER_MAX_LENGTH, showCharCounter } from '../../lib/chat';

export interface ComposerProps {
  onSend: (text: string) => void;
  /** Nothing can be typed or sent (booting, boot error, concierge unavailable). */
  disabled?: boolean;
  /** A reply is pending: the guest may keep typing, but cannot send yet. */
  busy?: boolean;
  /** Return focus to the textarea when the pending reply lands. False when a contact form was just offered. */
  refocusOnReply?: boolean;
}

export function Composer({ onSend, disabled, busy, refocusOnReply = true }: ComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const wasBusy = useRef(busy);
  // Only a message sent from here earns focus back; finishing boot must not pop the mobile keyboard.
  const sentHere = useRef(false);
  const counterVisible = showCharCounter(value.length);
  const canSend = !disabled && !busy && value.trim().length > 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // Sending with the button leaves focus on a now-disabled button; hand it back once the reply lands,
  // unless the guest has moved on (e.g. into a contact form) or a form was just offered.
  useEffect(() => {
    if (wasBusy.current && !busy && sentHere.current) {
      sentHere.current = false;
      const active = document.activeElement;
      const focusIsLost = !active || active === document.body || active.closest('form') === ref.current?.form;
      if (refocusOnReply && !disabled && focusIsLost) ref.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy, disabled, refocusOnReply]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || busy) return;
    sentHere.current = true;
    onSend(text);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor="chat-composer" className="sr-only">
          Message the hotel assistant
        </label>
        <textarea
          id="chat-composer"
          ref={ref}
          rows={1}
          value={value}
          maxLength={COMPOSER_MAX_LENGTH}
          disabled={disabled}
          aria-describedby={counterVisible ? 'chat-composer-count' : undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about rooms, dining, policies…"
          className={cn(fieldClasses, 'block min-h-12 resize-none py-3 leading-6')}
        />
        {counterVisible && (
          <p
            id="chat-composer-count"
            className={cn(
              'mt-1 text-right text-xs tabular-nums',
              value.length >= COMPOSER_MAX_LENGTH ? 'text-stop' : 'text-muted',
            )}
          >
            {value.length.toLocaleString()} / {COMPOSER_MAX_LENGTH.toLocaleString()} characters
          </p>
        )}
      </div>
      <Button
        type="submit"
        size="md"
        className={cn('size-12 shrink-0 px-0', counterVisible && 'mb-5')}
        disabled={!canSend}
        aria-label="Send message"
      >
        <SendHorizontal className="size-5" aria-hidden="true" />
      </Button>
    </form>
  );
}
