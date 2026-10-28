import { Link } from 'react-router';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
      <p className="text-sm text-muted">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="mt-2 rounded-xl text-sm font-medium text-accent-hover underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Back to home
      </Link>
    </main>
  );
}
