import type { Category } from '../../lib/categories';

export type { ContactOffer, LeadDetails, OfferState as FormState } from '../../lib/chat';

export type SendStatus = 'sent' | 'sending' | 'failed';

export interface ChatMessage {
  /** Stable React key (also the server id once known). */
  key: string;
  role: 'user' | 'assistant';
  content: string;
  category: Category | null;
  answered: boolean | null;
  /** ISO timestamp, shown on hover. */
  createdAt?: string;
  /** User messages only. */
  status?: SendStatus;
  /** Why a user message failed. */
  failure?: 'no-document' | 'unavailable' | 'rate-limited';
}

/** One screen-reader announcement; a fresh `id` re-announces identical text. */
export interface Announcement {
  id: number;
  text: string;
}
