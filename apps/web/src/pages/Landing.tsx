import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Badge, FlapText, type BadgeTone } from '../components/ui';
import { useDocumentTitle } from '../lib';

function clock() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Station clock in flap digits; re-reads every 10 s so the minute turns over on time. */
function BoardClock() {
  const [time, setTime] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setTime(clock()), 10_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time aria-label={`Local time ${time}`} className="flex flex-col items-end gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Local time</span>
      <FlapText text={time} tone="signal" a11y="inline" className="text-2xl sm:text-4xl" />
    </time>
  );
}

interface BoardRowProps {
  to: string;
  /** The button label the brief requires ("Admin" / "Regular User"); also the accessible name. */
  name: string;
  /** The board's service column, e.g. "Concierge". */
  service: string;
  description: string;
  status: string;
  tone: BadgeTone;
}

function BoardRow({ to, name, service, description, status, tone }: BoardRowProps) {
  const descId = useId();
  return (
    <Link
      to={to}
      aria-label={name}
      aria-describedby={descId}
      className="group grid grid-cols-1 items-center gap-x-4 gap-y-2.5 border-b border-rule px-2 py-5 transition-colors hover:bg-slat sm:grid-cols-[15rem_minmax(0,1fr)_6rem_11rem] sm:px-4 sm:py-6"
    >
      <span aria-hidden="true">
        <FlapText text={service} a11y="inline" className="text-[1.375rem] sm:text-[1.625rem]" />
      </span>
      <span id={descId} className="text-sm text-pretty text-dim sm:text-base">
        {description}
      </span>
      <span className="hidden sm:block">
        <Badge tone={tone}>{status}</Badge>
      </span>
      <span
        aria-hidden="true"
        className="mt-1 inline-flex h-11 items-center justify-between gap-3 justify-self-start rounded-slat bg-signal px-4 text-sm font-bold uppercase tracking-wider text-board transition-colors group-hover:bg-signal-hover sm:mt-0 sm:justify-self-stretch"
      >
        {name}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default function Landing() {
  useDocumentTitle();
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col justify-center px-4 py-10 sm:px-8 sm:py-16">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-rule-strong pb-6">
          <h1 className="min-w-0">
            <span className="sr-only">Cincinnati Hotel Assistant</span>
            <span aria-hidden="true" className="flex flex-col gap-3">
              <FlapText text="Cincinnati Hotel" a11y="inline" animateOnMount className="text-[clamp(1.6rem,6vw,4.25rem)]" />
              <FlapText text="Assistant" tone="signal" a11y="inline" animateOnMount className="text-[clamp(1.1rem,3vw,2rem)]" />
            </span>
          </h1>
          <BoardClock />
        </header>

        <p className="mt-6 max-w-2xl text-base text-pretty text-dim sm:text-lg">
          Ask about rooms, dining and amenities, or manage the hotel knowledge base.
        </p>

        <nav aria-label="Choose a mode" className="mt-10">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[15rem_minmax(0,1fr)_6rem_11rem] gap-x-4 border-b border-rule px-4 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted sm:grid"
          >
            <span>Service</span>
            <span>Destination</span>
            <span>Status</span>
            <span>Enter as</span>
          </div>
          <BoardRow
            to="/chat"
            name="Regular User"
            service="Concierge"
            description="Chat with the hotel concierge about rooms, dining and policies"
            status="Open"
            tone="success"
          />
          <BoardRow
            to="/admin"
            name="Admin"
            service="Hotel office"
            description="Upload the hotel guide and see what guests are asking"
            status="Staff"
            tone="neutral"
          />
        </nav>
      </main>
    </div>
  );
}
