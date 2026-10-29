import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Button } from '../ui';
import { fieldClasses } from '../ui/Input';
import { cn } from '../../lib/cn';

const MAX_LENGTH = 2000;

export interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const wasDisabled = useRef(disabled);
  // Only a message sent from here earns focus back; finishing boot must not pop the mobile keyboard.
  const sentHere = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // Return focus once a reply arrives (the textarea is disabled while pending).
  useEffect(() => {
    if (wasDisabled.current && !disabled && sentHere.current) {
      sentHere.current = false;
      ref.current?.focus();
    }
    wasDisabled.current = disabled;
  }, [disabled]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
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
      <label htmlFor="chat-composer" className="sr-only">
        Message the hotel assistant
      </label>
      <textarea
        id="chat-composer"
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_LENGTH}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about rooms, dining, policies…"
        className={cn(fieldClasses, 'min-h-12 resize-none py-3 leading-6')}
      />
      <Button
        type="submit"
        size="md"
        className="size-12 shrink-0 px-0"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        <SendHorizontal className="size-5" aria-hidden="true" />
      </Button>
    </form>
  );
}
