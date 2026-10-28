export const CATEGORIES = [
  'Rooms',
  'Restaurant & Dining',
  'Amenities & Facilities',
  'Pricing & Booking',
  'Location & Transport',
  'Policies',
  'Events',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export const CANNED_FALLBACK = "I'm sorry, I don't have that information right now.";
