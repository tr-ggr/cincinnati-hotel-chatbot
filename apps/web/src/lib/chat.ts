// Pure chat helpers (no React, no DOM) so they can be unit-tested in node.

/** Matches the API's `content` limit (1..2000). */
export const COMPOSER_MAX_LENGTH = 2000;
/** The character counter appears once a draft passes this length. */
export const COUNTER_THRESHOLD = 1800;

export function showCharCounter(length: number, threshold: number = COUNTER_THRESHOLD): boolean {
  return length > threshold;
}

/** How close (px) to the bottom of the log still counts as "reading the latest message". */
export const NEAR_BOTTOM_PX = 120;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function isNearBottom(m: ScrollMetrics, threshold: number = NEAR_BOTTOM_PX): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= threshold;
}

/**
 * Rough markdown -> plain text for the screen-reader announcement of an answer (the slip itself renders the
 * markdown): drops table rules, emphasis, heading marks, code fences and link targets.
 */
export function markdownToSpeech(md: string): string {
  return md
    .split('\n')
    .filter((line) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && !/^\s*```/.test(line))
    .map((line) =>
      line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .replace(/\s*\|\s*/g, ', ')
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|~~|`)/g, '')
        .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

// ---------- contact-form offers, persisted per session ----------

export type OfferState = 'open' | 'done' | 'dismissed';

export interface ContactOffer {
  /** The unanswered question the offer was made for. */
  question: string;
  state: OfferState;
  /** The lead was saved but its email did not go out (`emailStatus: 'failed'`). */
  emailFailed?: boolean;
}

export interface LeadDetails {
  name: string;
  phone: string;
  email: string;
}

export interface ChatState {
  /** Keyed by the assistant message id the offer follows. */
  offers: Record<string, ContactOffer>;
  /** Set once a lead has been saved in this session, so later offers can reuse it. */
  lead: LeadDetails | null;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const emptyChatState = (): ChatState => ({ offers: {}, lead: null });

export const chatStateKey = (sessionId: string) => `hotel.chat.${sessionId}`;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

const OFFER_STATES: readonly string[] = ['open', 'done', 'dismissed'];

function parseOffer(v: unknown): ContactOffer | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.question !== 'string' || typeof o.state !== 'string' || !OFFER_STATES.includes(o.state)) return null;
  const offer: ContactOffer = { question: o.question, state: o.state as OfferState };
  if (o.emailFailed === true) offer.emailFailed = true;
  return offer;
}

function parseLead(v: unknown): LeadDetails | null {
  if (!v || typeof v !== 'object') return null;
  const l = v as Record<string, unknown>;
  if (typeof l.name !== 'string' || typeof l.phone !== 'string' || typeof l.email !== 'string') return null;
  return { name: l.name, phone: l.phone, email: l.email };
}

/** Reads the saved offers / lead for a session; anything missing or malformed yields an empty state. */
export function loadChatState(sessionId: string, store: KeyValueStore | null = defaultStore()): ChatState {
  if (!store) return emptyChatState();
  try {
    const raw = store.getItem(chatStateKey(sessionId));
    if (!raw) return emptyChatState();
    const data = JSON.parse(raw) as { offers?: unknown; lead?: unknown };
    const offers: Record<string, ContactOffer> = {};
    if (data.offers && typeof data.offers === 'object') {
      for (const [key, value] of Object.entries(data.offers as Record<string, unknown>)) {
        const offer = parseOffer(value);
        if (offer) offers[key] = offer;
      }
    }
    return { offers, lead: parseLead(data.lead) };
  } catch {
    return emptyChatState();
  }
}

/** Writes the state, or removes the entry when there is nothing worth keeping. Never throws. */
export function saveChatState(sessionId: string, state: ChatState, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return;
  try {
    if (Object.keys(state.offers).length === 0 && !state.lead) store.removeItem(chatStateKey(sessionId));
    else store.setItem(chatStateKey(sessionId), JSON.stringify(state));
  } catch {
    // storage full or blocked: the offers live for this page only
  }
}

export function clearChatState(sessionId: string, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(chatStateKey(sessionId));
  } catch {
    // storage blocked: nothing to clear
  }
}
