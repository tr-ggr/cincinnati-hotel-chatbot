import { describe, expect, it } from 'vitest';
import {
  chatStateKey,
  clearChatState,
  COMPOSER_MAX_LENGTH,
  COUNTER_THRESHOLD,
  isNearBottom,
  loadChatState,
  markdownToSpeech,
  saveChatState,
  showCharCounter,
  type ChatState,
  type KeyValueStore,
} from './chat';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('showCharCounter', () => {
  it('stays hidden up to the threshold and appears past it', () => {
    expect(COUNTER_THRESHOLD).toBeLessThan(COMPOSER_MAX_LENGTH);
    expect(showCharCounter(0)).toBe(false);
    expect(showCharCounter(COUNTER_THRESHOLD)).toBe(false);
    expect(showCharCounter(COUNTER_THRESHOLD + 1)).toBe(true);
    expect(showCharCounter(COMPOSER_MAX_LENGTH)).toBe(true);
  });
});

describe('isNearBottom', () => {
  it.each([
    [{ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }, true], // at the bottom
    [{ scrollTop: 480, scrollHeight: 1000, clientHeight: 400 }, true], // 120 px away
    [{ scrollTop: 479, scrollHeight: 1000, clientHeight: 400 }, false], // 121 px away
    [{ scrollTop: 0, scrollHeight: 300, clientHeight: 400 }, true], // nothing to scroll
  ])('%o -> %s', (m, expected) => {
    expect(isNearBottom(m)).toBe(expected);
  });
});

describe('chat state storage', () => {
  const state: ChatState = {
    offers: {
      a1: { question: 'Is there a helipad?', state: 'done', emailFailed: true },
      a2: { question: 'Do you have a spa?', state: 'open' },
    },
    lead: { name: 'Jane', phone: '+1 513 555 0100', email: 'jane@example.com' },
  };

  it('round-trips offers and lead details per session', () => {
    const store = memoryStore();
    saveChatState('s1', state, store);
    expect(Object.keys(store.data)).toEqual([chatStateKey('s1')]);
    expect(loadChatState('s1', store)).toEqual(state);
    expect(loadChatState('s2', store)).toEqual({ offers: {}, lead: null });
  });

  it('removes the entry when there is nothing to keep', () => {
    const store = memoryStore();
    saveChatState('s1', state, store);
    saveChatState('s1', { offers: {}, lead: null }, store);
    expect(store.data).toEqual({});
    saveChatState('s1', state, store);
    clearChatState('s1', store);
    expect(store.data).toEqual({});
  });

  it('drops malformed entries instead of failing', () => {
    const store = memoryStore({
      [chatStateKey('s1')]: JSON.stringify({
        offers: { ok: { question: 'q', state: 'open' }, bad: { question: 1, state: 'open' }, worse: { state: 'nope' } },
        lead: { name: 'n' },
      }),
      [chatStateKey('s2')]: '{not json',
    });
    expect(loadChatState('s1', store)).toEqual({ offers: { ok: { question: 'q', state: 'open' } }, lead: null });
    expect(loadChatState('s2', store)).toEqual({ offers: {}, lead: null });
  });

  it('survives storage that throws or is missing', () => {
    expect(loadChatState('s1', throwingStore)).toEqual({ offers: {}, lead: null });
    expect(() => saveChatState('s1', state, throwingStore)).not.toThrow();
    expect(() => clearChatState('s1', throwingStore)).not.toThrow();
    expect(loadChatState('s1', null)).toEqual({ offers: {}, lead: null });
  });
});

describe('markdownToSpeech', () => {
  it('reads tables as comma-separated rows and drops the rule line', () => {
    expect(markdownToSpeech('| Room | Rate |\n| --- | :---: |\n| King | $199 |')).toBe('Room, Rate\nKing, $199');
  });

  it('strips emphasis, headings, code fences and link targets', () => {
    const md = '## Check-in\n\n**3 PM**, see [the guide](https://x.test) or `desk`.\n```\ncode\n```\n> *Quiet* hours';
    expect(markdownToSpeech(md)).toBe('Check-in\n3 PM, see the guide or desk.\ncode\nQuiet hours');
  });

  it('leaves plain sentences alone', () => {
    const canned = "I'm sorry, I don't have that information right now.";
    expect(markdownToSpeech(canned)).toBe(canned);
  });
});

