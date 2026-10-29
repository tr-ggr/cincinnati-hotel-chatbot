import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { FlapText } from '../components/ui';
import { useDocumentTitle } from '../lib';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col items-start justify-center px-4 py-16 sm:px-8">
      <h1>
        <FlapText text="Page not found" animateOnMount className="text-[clamp(1.75rem,7vw,3.5rem)]" />
      </h1>
      <p className="mt-5 max-w-md text-base text-dim">
        There is no service to this page. It may have moved, or the address has a typo.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-slat bg-signal px-4 text-sm font-bold uppercase tracking-wider text-board transition-colors hover:bg-signal-hover"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to home
      </Link>
    </main>
  );
}
