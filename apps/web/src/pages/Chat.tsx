import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { BackLink, Button, FlapText } from '../components/ui';
import {
  Composer,
  failureCopy,
  MessageList,
  SuggestionChips,
  type Announcement,
  type ChatMessage,
  type ContactOffer,
  type LeadDetails,
} from '../components/chat';
import {
  clearChatState,
  createLead,
  createSession,
  getHealth,
  getSession,
  isApiError,
  loadChatState,
  markdownToSpeech,
  saveChatState,
  sendMessage,
  SUGGESTIONS,
  useDocumentTitle,
  type Message,
} from '../lib';

const STORAGE_KEY = 'hotel.sessionId';
const WELCOME: ChatMessage = {
  key: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm the Cincinnati Hotel virtual concierge. Ask me anything about rooms, dining, amenities, policies or events.",
  category: null,
  answered: null,
};
const UNAVAILABLE_MESSAGE = "Our concierge isn't available yet. Please try again shortly.";
/** While the concierge is unavailable, quietly re-check so the banner clears on its own. */
const HEALTH_RECHECK_MS = 15_000;

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: session lives for this page only
  }
}

function fromServer(m: Message): ChatMessage {
  return {
    key: m.id,
    role: m.role,
    content: m.content,
    category: m.category,
    answered: m.answered,
    createdAt: m.createdAt,
    status: m.role === 'user' ? 'sent' : undefined,
  };
}

let localCounter = 0;
const localKey = () => `local-${Date.now()}-${localCounter++}`;
let announceCounter = 0;

export default function Chat() {
  useDocumentTitle('Chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Record<string, ContactOffer>>({});
  /** Contact details saved by a lead in this session; later unanswered questions reuse them. */
  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [pending, setPending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  /** From GET /api/health: true / false, or null while unknown (a failed check never blocks the guest). */
  const [docAvailable, setDocAvailable] = useState<boolean | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [refocusOnReply, setRefocusOnReply] = useState(true);

  const sessionIdRef = useRef<string | null>(null);
  const bootPromise = useRef<Promise<string> | null>(null);
  const pendingRef = useRef(false);

  const announce = useCallback((text: string) => {
    setAnnouncement({ id: ++announceCounter, text });
  }, []);

  /** Resolves to whether a guide is live, or null when health could not be read (network / 503). */
  const checkHealth = useCallback(async (): Promise<boolean | null> => {
    try {
      const h = await getHealth();
      setDocAvailable(h.activeDocument);
      return h.activeDocument;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    getHealth().then(
      (h) => {
        if (active) setDocAvailable(h.activeDocument);
      },
      () => {
        // unknown: don't block the guest
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (docAvailable !== false) return;
    const t = setInterval(() => void checkHealth(), HEALTH_RECHECK_MS);
    return () => clearInterval(t);
  }, [docAvailable, checkHealth]);

  const adoptSession = useCallback((id: string) => {
    sessionIdRef.current = id;
    writeStored(id);
    setSessionId(id);
  }, []);

  /** Resolves a usable session id; concurrent / StrictMode double calls share one in-flight promise. */
  const ensureSession = useCallback((): Promise<string> => {
    if (sessionIdRef.current) return Promise.resolve(sessionIdRef.current);
    if (bootPromise.current) return bootPromise.current;
    const p = (async () => {
      const stored = readStored();
      if (stored) {
        try {
          const s = await getSession(stored);
          const saved = loadChatState(s.id);
          setMessages(s.messages.map(fromServer));
          setOffers(saved.offers);
          setLead(saved.lead);
          adoptSession(s.id);
          return s.id;
        } catch (e) {
          if (!(isApiError(e) && e.status === 404)) throw e;
          clearChatState(stored);
          writeStored(null);
        }
      }
      const s = await createSession();
      adoptSession(s.id);
      return s.id;
    })();
    bootPromise.current = p;
    p.then(
      () => {
        bootPromise.current = null;
      },
      () => {
        bootPromise.current = null;
      },
    );
    return p;
  }, [adoptSession]);

  useEffect(() => {
    let active = true;
    ensureSession()
      .then(() => {
        if (active) setBootError(null);
      })
      .catch((e) => {
        if (active) setBootError(isApiError(e) ? e.message : 'Could not start a conversation.');
      })
      .finally(() => {
        // StrictMode: the first effect is cleaned up, the second one clears the flag.
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, [ensureSession]);

  // Keep pending contact-form offers (and saved details) across a refresh of this tab.
  useEffect(() => {
    if (sessionId) saveChatState(sessionId, { offers, lead });
  }, [sessionId, offers, lead]);

  const patchMessage = useCallback((key: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }, []);

  const deliver = useCallback(
    async (key: string, content: string) => {
      pendingRef.current = true;
      setPending(true);
      patchMessage(key, { status: 'sending', failure: undefined });
      try {
        let sid = await ensureSession();
        let res;
        try {
          res = await sendMessage(sid, content);
        } catch (e) {
          if (!(isApiError(e) && e.code === 'SESSION_NOT_FOUND')) throw e;
          // Session vanished server-side: start a new one and retry once.
          sessionIdRef.current = null;
          writeStored(null);
          sid = await ensureSession();
          res = await sendMessage(sid, content);
        }
        const user = fromServer(res.userMessage);
        const assistant = fromServer(res.assistantMessage);
        setMessages((prev) => [...prev.map((m) => (m.key === key ? { ...user, key } : m)), assistant]);
        if (res.offerContactForm) {
          setOffers((prev) => ({ ...prev, [assistant.key]: { question: content, state: 'open' } }));
        }
        setRefocusOnReply(!res.offerContactForm);
        setDocAvailable(true);
        announce(`Concierge: ${markdownToSpeech(assistant.content)}`);
      } catch (e) {
        const failure: ChatMessage['failure'] =
          isApiError(e) && e.code === 'NO_DOCUMENT'
            ? 'no-document'
            : isApiError(e) && e.code === 'RATE_LIMITED'
              ? 'rate-limited'
              : 'unavailable';
        if (failure === 'no-document') setDocAvailable(false);
        patchMessage(key, { status: 'failed', failure });
        setRefocusOnReply(true);
        announce(failureCopy(failure));
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [announce, ensureSession, patchMessage],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (pendingRef.current) return;
      const key = localKey();
      setMessages((prev) => [
        ...prev,
        { key, role: 'user', content: text, category: null, answered: null, status: 'sending', createdAt: new Date().toISOString() },
      ]);
      void deliver(key, text);
    },
    [deliver],
  );

  const handleRetry = useCallback(
    async (m: ChatMessage) => {
      if (pendingRef.current) return;
      if (m.failure === 'no-document') {
        // Re-check first so a still-missing guide doesn't cost a round trip through the assistant.
        pendingRef.current = true;
        patchMessage(m.key, { status: 'sending', failure: undefined });
        const available = await checkHealth();
        pendingRef.current = false;
        if (available === false) {
          patchMessage(m.key, { status: 'failed', failure: 'no-document' });
          announce(UNAVAILABLE_MESSAGE);
          return;
        }
      }
      void deliver(m.key, m.content);
    },
    [announce, checkHealth, deliver, patchMessage],
  );

  const handleLeadSubmit = useCallback(
    async (key: string, details?: LeadDetails) => {
      const who = details ?? lead;
      const sid = sessionIdRef.current;
      if (!who || !sid) throw new Error('Something went wrong. Please try again.');
      const res = await createLead({ sessionId: sid, ...who, unansweredQuestion: offers[key]?.question });
      setLead(who);
      setOffers((prev) => {
        const offer = prev[key];
        if (!offer) return prev;
        const next: ContactOffer = { question: offer.question, state: 'done' };
        if (res.emailStatus === 'failed') next.emailFailed = true;
        return { ...prev, [key]: next };
      });
    },
    [lead, offers],
  );

  const handleOfferDismiss = useCallback((key: string) => {
    setOffers((prev) => {
      const offer = prev[key];
      return offer ? { ...prev, [key]: { ...offer, state: 'dismissed' } } : prev;
    });
  }, []);

  const handleNewConversation = useCallback(() => {
    if (sessionIdRef.current) clearChatState(sessionIdRef.current);
    writeStored(null);
    sessionIdRef.current = null;
    bootPromise.current = null;
    setSessionId(null);
    setMessages([]);
    setOffers({});
    setLead(null);
    setAnnouncement(null);
    setBootError(null);
    setBooting(true);
    void checkHealth();
    ensureSession()
      .catch((e) => setBootError(isApiError(e) ? e.message : 'Could not start a conversation.'))
      .finally(() => setBooting(false));
  }, [checkHealth, ensureSession]);

  const hasUserMessages = messages.some((m) => m.role === 'user');
  const display = useMemo(() => [WELCOME, ...messages], [messages]);
  const unavailable = docAvailable === false;
  const composerDisabled = booting || !!bootError || unavailable;

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b-2 border-rule-strong bg-slat">
        <div className="mx-auto flex w-full max-w-[760px] items-center gap-3 px-3 py-2.5 sm:px-6">
          <BackLink />
          <div className="min-w-0 flex-1">
            <h1>
              <span className="sr-only">Cincinnati Hotel Assistant</span>
              <span aria-hidden="true">
                <FlapText text="Cincinnati Hotel" a11y="inline" className="text-[1.125rem] sm:text-[1.375rem]" />
              </span>
            </h1>
            <p className="mt-1 truncate text-xs text-dim">Assistant · answers from the hotel guide</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="size-11 px-0 sm:h-11 sm:w-auto sm:px-3"
            onClick={handleNewConversation}
            disabled={pending || !hasUserMessages}
            aria-label="New conversation"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">New conversation</span>
          </Button>
        </div>
      </header>

      {unavailable && (
        <div role="alert" className="bg-signal px-4 py-2.5 text-sm font-semibold text-board">
          <div className="mx-auto flex max-w-[760px] items-center gap-2 sm:px-2">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {UNAVAILABLE_MESSAGE}
          </div>
        </div>
      )}

      {bootError && (
        <div role="alert" className="border-b border-stop/40 bg-stop/10 px-4 py-2.5 text-sm text-stop">
          <div className="mx-auto flex max-w-[760px] items-center justify-between gap-2 sm:px-2">
            <span>{bootError}</span>
            <Button variant="secondary" size="sm" onClick={handleNewConversation}>
              Try again
            </Button>
          </div>
        </div>
      )}

      <MessageList
        messages={display}
        pending={pending}
        sessionId={sessionId}
        offers={offers}
        savedLead={lead}
        onLeadSubmit={handleLeadSubmit}
        onOfferDismiss={handleOfferDismiss}
        onRetry={(m) => void handleRetry(m)}
        announcement={announcement}
        footer={
          !hasUserMessages && !booting && !bootError && !unavailable ? (
            <SuggestionChips suggestions={SUGGESTIONS} onPick={handleSend} disabled={pending} />
          ) : null
        }
      />

      <div className="border-t border-rule bg-slat pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6">
          <Composer onSend={handleSend} disabled={composerDisabled} busy={pending} refocusOnReply={refocusOnReply} />
        </div>
      </div>
    </div>
  );
}
