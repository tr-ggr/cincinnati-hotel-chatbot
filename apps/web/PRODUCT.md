# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Hotel guests** asking practical questions before or during a stay (check-in, rooms, dining, pool hours, pets,
  policies, events), on a phone or a laptop.
- **Hotel admin** who uploads the single hotel-information PDF (replacing the previous one) and watches what guests ask.
- **Tauga AI reviewers** evaluating the entrance task: they try both roles, on desktop and mobile with equal weight, and
  score functionality, accuracy, real-time stats and UI/UX ("modern, clear, pleasant to use").

## Product Purpose
A concierge chatbot for "Cincinnati Hotel" that answers **only** from the hotel's own uploaded guide. When the guide
does not cover a question it says so plainly and offers a short contact form so a person can follow up by email.
Success: correct answers grounded in the PDF, an honest fallback, and an admin view whose numbers move as guests chat.

## Positioning
Not a general assistant: the knowledge base is one document the hotel controls. The assistant never guesses, and its
"I don't know" turns into a human hand-off instead of a dead end.

## Operating Context
- Landing page offers two roles as simple buttons labelled exactly **"Admin"** and **"Regular User"** (task requirement).
- No authentication; roles are a demo of both experiences.
- Admin: upload a PDF (max 10 MB, replaces the previous one once it is ready), see total chat sessions, questions asked, unanswered,
  leads, and questions per category; stats update in real time over SSE (polling fallback).
- Guest chat: suggested questions, markdown answers, typing state, retry on failure, contact form (Name, Phone, Email).

## Capabilities and Constraints
- Categories (fixed, 8): Rooms, Restaurant & Dining, Amenities & Facilities, Pricing & Booking, Location & Transport,
  Policies, Events, Other.
- Canned fallback sentence, exact: `I'm sorry, I don't have that information right now.`
- UI dependencies stay light: Tailwind v4, lucide-react, react-markdown (+ remark-gfm), clsx. No component kits or state libraries.
- Accessible names used by e2e tests must stay (see repo `e2e/tests/ui`).

## Brand Commitments
- Name: "Cincinnati Hotel" (fictional property from the brief). An identity (mark, palette, type, voice) may be invented.
- No invented facts: star ratings, prices, addresses, amenities or awards appear only if the uploaded PDF says them.

## Evidence on Hand
- Sample guide: `docs/sample/cincinnati-hotel.pdf` (generated sample content).
- No photography, logo, testimonials or press exist; do not fabricate them.

## Product Principles
1. Answers come from the hotel's guide, and the interface says so.
2. "I don't know" is a hand-off, never a dead end.
3. Real-time means the numbers visibly move, not a badge claiming they do.
4. Both roles must work as well on a phone as on a desktop.

## Accessibility & Inclusion
WCAG 2.2 AA: contrast, visible focus, keyboard paths, screen-reader names for chat log and stats, reduced motion.
