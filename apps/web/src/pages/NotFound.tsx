import { Link } from 'react-router';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink" aria-hidden="true">
        <Compass className="size-7" />
      </span>
      <p className="mt-2 text-sm font-semibold tracking-widest text-accent">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">The page you are looking for does not exist or may have moved.</p>
      <Link
        to="/"
        className="mt-3 inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Back to home
      </Link>
    </main>
  );
}
