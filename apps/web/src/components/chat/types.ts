import type { Category } from '../../lib/categories';

export type SendStatus = 'sent' | 'sending' | 'failed';

export interface ChatMessage {
  /** Stable React key (also the server id once known). */
  key: string;
  role: 'user' | 'assistant';
  content: string;
  category: Category | null;
  answered: boolean | null;
  /** User messages only. */
  status?: SendStatus;
  /** Why a user message failed. */
  failure?: 'no-document' | 'unavailable';
}

export type FormState = 'open' | 'done' | 'dismissed';

export interface ContactOffer {
  question: string;
  state: FormState;
}
