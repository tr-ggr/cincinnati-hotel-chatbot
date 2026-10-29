import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

/** Square slat back control shared by the Chat and Admin headers (44px target). */
export function BackLink() {
  return (
    <Link
      to="/"
      aria-label="Back to home"
      className="flex size-11 shrink-0 items-center justify-center rounded-slat border border-rule bg-slat text-dim transition-colors hover:border-rule-strong hover:text-flap"
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </Link>
  );
}
