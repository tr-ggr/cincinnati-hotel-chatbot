import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { BackLink, Button, FlapText } from '../components/ui';
import {
  Composer,
  MessageList,
  SuggestionChips,
  type ChatMessage,
  type ContactOffer,
  type FormState,
} from '../components/chat';
import {
  createSession,
  getSession,
  isApiError,
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
const NO_DOC_MESSAGE = "The knowledge base hasn't been uploaded yet. Please ask an admin.";

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

export default function Chat() {
  useDocumentTitle('Chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Record<string, ContactOffer>>({});
  const [pending, setPending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [noDocument, setNoDocument] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const bootPromise = useRef<Promise<string> | null>(null);
  const pendingRef = useRef(false);

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
          setMessages(s.messages.map(fromServer));
          adoptSession(s.id);
          return s.id;
        } catch (e) {
          if (!(isApiError(e) && e.status === 404)) throw e;
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
    setBooting(true);
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
        setMessages((prev) => [
          ...prev.map((m) => (m.key === key ? { ...user, key } : m)),
          assistant,
        ]);
        if (res.offerContactForm) {
          setOffers((prev) => ({ ...prev, [assistant.key]: { question: content, state: 'open' } }));
        }
        setNoDocument(false);
      } catch (e) {
        if (isApiError(e) && e.code === 'NO_DOCUMENT') {
          setNoDocument(true);
          patchMessage(key, { status: 'failed', failure: 'no-document' });
        } else if (isApiError(e) && e.code === 'RATE_LIMITED') {
          patchMessage(key, { status: 'failed', failure: 'rate-limited' });
        } else {
          patchMessage(key, { status: 'failed', failure: 'unavailable' });
        }
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [ensureSession, patchMessage],
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
    (m: ChatMessage) => {
      if (pendingRef.current) return;
      void deliver(m.key, m.content);
    },
    [deliver],
  );

  const handleOfferChange = useCallback((key: string, state: FormState) => {
    setOffers((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], state } } : prev));
  }, []);

  const handleNewConversation = useCallback(() => {
    writeStored(null);
    sessionIdRef.current = null;
    bootPromise.current = null;
    setSessionId(null);
    setMessages([]);
    setOffers({});
    setNoDocument(false);
    setBootError(null);
    setBooting(true);
    ensureSession()
      .catch((e) => setBootError(isApiError(e) ? e.message : 'Could not start a conversation.'))
      .finally(() => setBooting(false));
  }, [ensureSession]);

  const hasUserMessages = messages.some((m) => m.role === 'user');
  const display = useMemo(() => [WELCOME, ...messages], [messages]);
  const composerDisabled = pending || booting || !!bootError;

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

      {noDocument && (
        <div role="alert" className="bg-signal px-4 py-2.5 text-sm font-semibold text-board">
          <div className="mx-auto flex max-w-[760px] items-center gap-2 sm:px-2">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {NO_DOC_MESSAGE}
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
        onOfferChange={handleOfferChange}
        onRetry={handleRetry}
        footer={
          !hasUserMessages && !booting && !bootError ? (
            <SuggestionChips suggestions={SUGGESTIONS} onPick={handleSend} disabled={pending} />
          ) : null
        }
      />

      <div className="border-t border-rule bg-slat pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6">
          <Composer onSend={handleSend} disabled={composerDisabled} />
        </div>
      </div>
    </div>
  );
}
