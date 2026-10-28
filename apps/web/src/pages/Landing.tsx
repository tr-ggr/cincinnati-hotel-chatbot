import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Hotel, MessageCircle, ShieldCheck, type LucideProps } from 'lucide-react';

interface RoleCardProps {
  to: string;
  icon: ComponentType<LucideProps>;
  title: string;
  description: string;
}

function RoleCard({ to, icon: Icon, title, description }: RoleCardProps) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-soft transition-colors group-hover:bg-accent-soft group-hover:text-accent-ink">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-ink">{title}</span>
        <span className="block text-sm text-muted">{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-accent text-white shadow-md">
          <Hotel className="size-8" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Cincinnati Hotel Assistant</h1>
        <p className="mt-3 max-w-md text-base text-muted">
          Ask about rooms, dining and amenities, or manage the hotel knowledge base.
        </p>
        <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
          <RoleCard to="/admin" icon={ShieldCheck} title="Admin" description="Upload the hotel PDF and view live stats" />
          <RoleCard to="/chat" icon={MessageCircle} title="Regular User" description="Chat with the hotel assistant" />
        </div>
      </main>
      <footer className="px-4 py-6 text-center text-sm text-muted">Powered by n8n + OpenAI</footer>
    </div>
  );
}
