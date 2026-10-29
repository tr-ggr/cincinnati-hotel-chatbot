import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button, Input } from '../ui';
import { isApiError } from '../../lib/api';
import type { ContactOffer, LeadDetails } from './types';

export interface ContactFormCardProps {
  offer: ContactOffer;
  /** Details from a lead already saved in this session; when set, the card offers a one-tap resend instead. */
  savedLead: LeadDetails | null;
  /** Posts a lead for this offer (with `details`, or the saved ones when omitted). Rejects with an ApiError. */
  onSubmit: (details?: LeadDetails) => Promise<void>;
  onDismiss: () => void;
}

interface Errors {
  name?: string;
  phone?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELD_ORDER = ['name', 'phone', 'email'] as const;

function validate(name: string, phone: string, email: string): Errors {
  const errors: Errors = {};
  if (name.trim().length < 2) errors.name = 'Please enter at least 2 characters.';
  const digits = phone.replace(/\D/g, '');
  if (!/^[+\d\s\-()]+$/.test(phone.trim()) || digits.length < 7) {
    errors.phone = 'Enter a valid phone number (at least 7 digits).';
  }
  if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
  return errors;
}

function leadError(err: unknown): string {
  if (isApiError(err)) {
    if (err.code === 'RATE_LIMITED') return "You're sending messages too quickly. Wait a moment and try again.";
    if (err.code === 'SESSION_NOT_FOUND') return 'Your chat session expired. Please refresh the page and try again.';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

const boxClasses = 'max-w-[min(100%,34rem)] rounded-slat border px-4 py-3 text-sm';

function SentLine() {
  return (
    <div role="status" className={`${boxClasses} flex items-center gap-2 border-go/50 bg-go/10 font-medium text-go`}>
      <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
      Thanks, our team will contact you shortly.
    </div>
  );
}

/** Resend with saved details: used for "email didn't go through" and for later unanswered questions. */
function ResendLine({
  text,
  action,
  tone,
  onSubmit,
}: {
  text: string;
  action: string;
  tone: 'stop' | 'neutral';
  onSubmit: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setFailure(null);
    try {
      await onSubmit();
    } catch (err) {
      setFailure(leadError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Contact details"
      className={`${boxClasses} ${tone === 'stop' ? 'border-stop/50 bg-stop/10' : 'border-rule-strong bg-slat'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className={`flex min-w-0 items-start gap-2 text-pretty ${tone === 'stop' ? 'text-stop' : 'text-flap'}`}>
          {tone === 'stop' && <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {text}
        </p>
        <Button variant={tone === 'stop' ? 'secondary' : 'primary'} size="sm" loading={sending} onClick={() => void send()}>
          {failure ? 'Try again' : action}
        </Button>
      </div>
      {failure && (
        <p role="alert" className="mt-2 text-stop">
          {failure}
        </p>
      )}
    </div>
  );
}

export function ContactFormCard({ offer, savedLead, onSubmit, onDismiss }: ContactFormCardProps) {
  if (offer.state === 'done') {
    if (!offer.emailFailed) return <SentLine />;
    return (
      <ResendLine
        tone="stop"
        text="We saved your details, but the email didn't go through."
        action="Try again"
        onSubmit={() => onSubmit()}
      />
    );
  }
  if (savedLead) {
    return (
      <ResendLine
        tone="neutral"
        text="We have your details — send this question to the team too?"
        action="Send to the team"
        onSubmit={() => onSubmit()}
      />
    );
  }
  return <FullForm onSubmit={onSubmit} onDismiss={onDismiss} />;
}

function FullForm({ onSubmit, onDismiss }: Pick<ContactFormCardProps, 'onSubmit' | 'onDismiss'>) {
  const uid = useId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const refs: Record<(typeof FIELD_ORDER)[number], RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const errs = validate(name, phone, email);
    setErrors(errs);
    const firstInvalid = FIELD_ORDER.find((f) => errs[f]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      await onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() });
      // On success the parent swaps this form for the confirmation line.
    } catch (err) {
      setApiError(leadError(err));
      setSubmitting(false);
    }
  };

  const field = (
    id: (typeof FIELD_ORDER)[number],
    label: string,
    value: string,
    set: (v: string) => void,
    props: { type: string; autoComplete: string; inputMode?: 'tel' | 'email' },
  ) => {
    const error = errors[id];
    return (
      <div>
        <label htmlFor={`${uid}-${id}`} className="mb-1.5 block text-sm font-semibold text-dim">
          {label}
        </label>
        <Input
          ref={refs[id]}
          id={`${uid}-${id}`}
          value={value}
          onChange={(e) => set(e.target.value)}
          invalid={!!error}
          aria-required="true"
          aria-describedby={error ? `${uid}-${id}-err` : undefined}
          disabled={submitting}
          {...props}
        />
        {error && (
          <p id={`${uid}-${id}-err`} className="mt-1.5 text-sm text-stop">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Contact details"
      className="max-w-[min(100%,34rem)] rounded-slat border border-rule-strong bg-slat"
    >
      <p className="border-b border-rule px-4 py-3 text-base font-semibold text-pretty text-flap">
        Would you like to leave your contact details so our team can get back to you?
      </p>
      <div className="space-y-3 p-4">
        {field('name', 'Name', name, setName, { type: 'text', autoComplete: 'name' })}
        {field('phone', 'Phone', phone, setPhone, { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
        {field('email', 'Email', email, setEmail, { type: 'email', autoComplete: 'email', inputMode: 'email' })}
        {apiError && (
          <p role="alert" className="text-sm text-stop">
            {apiError}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onDismiss} disabled={submitting}>
            No thanks
          </Button>
          <Button type="submit" loading={submitting}>
            Send details
          </Button>
        </div>
      </div>
    </form>
  );
}
