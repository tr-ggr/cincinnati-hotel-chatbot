import { useId, useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, Input } from '../ui';
import { createLead, isApiError } from '../../lib/api';

export interface ContactFormCardProps {
  sessionId: string;
  question: string;
  done: boolean;
  onDone: () => void;
  onDismiss: () => void;
}

interface Errors {
  name?: string;
  phone?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(name: string, phone: string, email: string): Errors {
  const errors: Errors = {};
  if (name.trim().length < 2) errors.name = 'Please enter your name.';
  const digits = phone.replace(/\D/g, '');
  if (!/^[+\d\s\-()]+$/.test(phone.trim()) || digits.length < 7) {
    errors.phone = 'Enter a valid phone number (at least 7 digits).';
  }
  if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
  return errors;
}

export function ContactFormCard({ sessionId, question, done, onDone, onDismiss }: ContactFormCardProps) {
  const uid = useId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  if (done) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
        Thanks, our team will contact you shortly.
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const errs = validate(name, phone, email);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setApiError(null);
    try {
      await createLead({
        sessionId,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        unansweredQuestion: question,
      });
      onDone();
    } catch (err) {
      setApiError(isApiError(err) ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    error: string | undefined,
    props: { type: string; autoComplete: string; inputMode?: 'tel' | 'email' },
  ) => (
    <div>
      <label htmlFor={`${uid}-${id}`} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <Input
        id={`${uid}-${id}`}
        value={value}
        onChange={(e) => set(e.target.value)}
        invalid={!!error}
        aria-describedby={error ? `${uid}-${id}-err` : undefined}
        disabled={submitting}
        {...props}
      />
      {error && (
        <p id={`${uid}-${id}-err`} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Contact details"
      className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm"
    >
      {field('name', 'Name', name, setName, errors.name, { type: 'text', autoComplete: 'name' })}
      {field('phone', 'Phone', phone, setPhone, errors.phone, { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
      {field('email', 'Email', email, setEmail, errors.email, { type: 'email', autoComplete: 'email', inputMode: 'email' })}
      {apiError && (
        <p role="alert" className="text-sm text-red-700">
          {apiError}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onDismiss} disabled={submitting}>
          No thanks
        </Button>
        <Button type="submit" loading={submitting}>
          Send details
        </Button>
      </div>
    </form>
  );
}
