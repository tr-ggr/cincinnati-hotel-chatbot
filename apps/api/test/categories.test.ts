import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANNED_FALLBACK, CATEGORIES, isCategory } from '../src/lib/categories.js';
import * as web from '../../web/src/lib/categories';

// The category list lives in four places (CLAUDE.md "Categories"); the n8n copy is checked in apps/n8n.
describe('categories', () => {
  it('has the 8 agreed values', () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(CATEGORIES.at(-1)).toBe('Other');
  });

  it('isCategory accepts only listed values', () => {
    expect(isCategory('Rooms')).toBe(true);
    expect(isCategory('rooms')).toBe(false);
    expect(isCategory(undefined)).toBe(false);
  });

  it('matches apps/web exactly', () => {
    expect(web.CATEGORIES).toEqual(CATEGORIES);
    expect(web.CANNED_FALLBACK).toBe(CANNED_FALLBACK);
  });

  it('matches the messages.category CHECK constraint', () => {
    const sql = readFileSync(new URL('../../../infra/db/01-schema.sql', import.meta.url), 'utf8');
    const check = /category\s+text CHECK \(category IN \(([^)]*)\)\)/.exec(sql)?.[1];
    expect(check, 'CHECK constraint not found').toBeDefined();
    const values = [...check!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...CATEGORIES]);
  });

  it('uses the exact canned fallback sentence', () => {
    expect(CANNED_FALLBACK).toBe("I'm sorry, I don't have that information right now.");
  });
});
