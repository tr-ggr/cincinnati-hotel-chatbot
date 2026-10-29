import { describe, expect, it } from 'vitest';
import { formatBytes, formatClockTime, formatRelativeTime } from './format';

describe('formatBytes', () => {
  it.each([
    [-1, '-'],
    [Number.NaN, '-'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [20 * 1024, '20 KB'],
    [3.2 * 1024 * 1024, '3.2 MB'],
    [5 * 1024 ** 4, '5120 GB'],
  ])('%d -> %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it.each([
    [10_000, 'just now'],
    [60_000, '1 minute ago'],
    [5 * 60_000, '5 minutes ago'],
    [2 * 3_600_000, '2 hours ago'],
    [3 * 86_400_000, '3 days ago'],
  ])('%d ms ago -> %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), now)).toBe(expected);
  });

  it('falls back to a date after a week and to "-" for garbage', () => {
    expect(formatRelativeTime(ago(30 * 86_400_000), now)).not.toMatch(/ago$/);
    expect(formatRelativeTime('not a date', now)).toBe('-');
  });
});

describe('formatClockTime', () => {
  it('formats local time as zero-padded 24-hour HH:MM:SS', () => {
    expect(formatClockTime(new Date(2026, 9, 29, 9, 5, 7).toISOString())).toBe('09:05:07');
    expect(formatClockTime(new Date(2026, 9, 29, 23, 59, 0).toISOString())).toBe('23:59:00');
  });

  it('returns "-" for garbage', () => {
    expect(formatClockTime('nope')).toBe('-');
  });
});
