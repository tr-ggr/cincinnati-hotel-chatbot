---
name: Cincinnati Hotel Assistant
description: A station-grade hotel concierge posted on a Union Terminal split-flap departures board.
colors:
  board: "#101215"
  slat: "#171a1e"
  slat-2: "#1f2328"
  rule: "#2b3037"
  rule-strong: "#3b414a"
  muted: "#858e99"
  dim: "#a7aeb7"
  flap: "#ece7da"
  signal: "#f0b429"
  signal-hover: "#f7c650"
  go: "#4fb07a"
  stop: "#e8674f"
  slip: "#efe9dc"
  slip-ink: "#16181b"
  slip-muted: "#5c5a55"
  slip-rule: "#d6cfbf"
typography:
  display:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "clamp(1.6rem, 6vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
  numeral:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
  title:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "0.025em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.16em"
  button:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: "0.025em"
  plate:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.43
    letterSpacing: "0.05em"
  badge:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    lineHeight: 1.43
    letterSpacing: "0.05em"
rounded:
  flap: "2px"
  slat: "3px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.board}"
    typography: "{typography.button}"
    rounded: "{rounded.slat}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.signal-hover}"
    textColor: "{colors.board}"
  button-primary-disabled:
    backgroundColor: "{colors.slat-2}"
    textColor: "{colors.muted}"
  button-secondary:
    backgroundColor: "{colors.slat}"
    textColor: "{colors.flap}"
    typography: "{typography.button}"
    rounded: "{rounded.slat}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.slat-2}"
    textColor: "{colors.flap}"
  button-ghost:
    textColor: "{colors.dim}"
    typography: "{typography.button}"
    rounded: "{rounded.slat}"
    padding: "0 16px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.slat-2}"
    textColor: "{colors.flap}"
  signal-plate:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.board}"
    typography: "{typography.plate}"
    rounded: "{rounded.slat}"
    padding: "0 16px"
    height: "44px"
  status-flap-go:
    backgroundColor: "{colors.go}"
    textColor: "{colors.board}"
    typography: "{typography.badge}"
    rounded: "{rounded.flap}"
    padding: "0 8px"
    height: "24px"
  status-flap-stop:
    backgroundColor: "{colors.stop}"
    textColor: "{colors.board}"
    typography: "{typography.badge}"
    rounded: "{rounded.flap}"
    padding: "0 8px"
    height: "24px"
  status-flap-neutral:
    backgroundColor: "{colors.rule-strong}"
    textColor: "{colors.flap}"
    typography: "{typography.badge}"
    rounded: "{rounded.flap}"
    padding: "0 8px"
    height: "24px"
  board-panel:
    backgroundColor: "{colors.slat}"
    rounded: "{rounded.slat}"
  input:
    backgroundColor: "{colors.board}"
    textColor: "{colors.flap}"
    typography: "{typography.body}"
    rounded: "{rounded.slat}"
    padding: "0 14px"
    height: "44px"
  ivory-slip:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.slip-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.slat}"
    padding: "12px 16px"
  guest-entry:
    backgroundColor: "{colors.slat-2}"
    textColor: "{colors.flap}"
    typography: "{typography.body}"
    rounded: "{rounded.slat}"
    padding: "10px 16px"
  suggestion-chip:
    backgroundColor: "{colors.slat}"
    textColor: "{colors.flap}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.slat}"
    padding: "8px 14px"
    height: "40px"
  suggestion-chip-hover:
    textColor: "{colors.signal}"
---

# Design System: Cincinnati Hotel Assistant

## Overview

**Creative North Star: "The Union Terminal Departures Board"**

The hotel runs like the concourse at Cincinnati's Union Terminal. Roles, statuses and statistics are posted on a split-flap departures board: a slat-black field, ivory lettering on hinged flap cells, hairline rules between rows, and signal-amber plates for the one thing you can do next. The guest's conversation is the enquiry window under the board. You post your question on a slat, and the concierge hands back an ivory printed slip. The admin dashboard is the same board seen from the station office. Its numbers riffle and its rows brighten when guests ask something, and that motion is the proof that it is live.

Density is board-like and deliberate. Rows are tall (20 to 24px of vertical padding), columns are fixed-width the way a departures board fixes its "Service / Destination / Status" columns, and prose is kept short and set in a highly legible humanist sans so the flap lettering can carry the character. The palette is dark by nature (`color-scheme: dark`) with no light theme. The board is the only environment.

The build explicitly refuses the white chat column with a rounded-card dashboard: no soft pastel bubbles, no floating cards on a grey page, no pill-shaped everything.

**Key Characteristics:**
- Split-flap cells (Big Shoulders Display, 800, uppercase, a 1px hinge line across the middle) for names, titles, the clock and every count.
- One action hue: signal amber plates with board-black lettering.
- Ivory slips for every assistant answer; guest entries stay on slat.
- Hairline-ruled rows and a heavier 2px rule under every board header.
- Flat surfaces, with depth from an eight-step slat ladder and only two shadows.
- Motion is mechanical: riffle, drop, brighten, step. Nothing bounces.

## Colors

A cool near-black slat ladder carries everything. Warm ivory letters it, signal amber marks the action, and green and red are reserved for status flaps.

### Primary
- **Signal Amber** (`signal`): The fill of every primary action plate (role plates on the landing board, "Send details", "Choose PDF", the send button) with board-black lettering at 10:1. It is also the board's own lettering where something should catch the eye: the station clock, the "Assistant" flap line, the lit segments of the category bars, the focus ring, text selection and the caret. A 16% wash of it is the row-lit flash.
- **Signal Amber, Lit** (`signal-hover`): Hover state of amber plates only. Slightly brighter, never a different hue.

### Secondary
- **Platform Green** (`go`): Status flaps that mean open or ready ("Open", "Ready") and the lead-sent confirmation, shown as a 10% green tint with a 50% green border and green text.
- **Signal Red** (`stop`): Status flaps that mean failed, invalid field borders, field error text, and error notices (10% red tint, 50% red border, red text at 5.4:1 on slat).

### Neutral
- **Board Black** (`board`): The page background, the inside of text fields and the drop zone, and the lettering on every amber, green and red plate.
- **Slat** (`slat`): Board panels, header and composer bars, secondary buttons, suggestion chips, stat cells, and the row hover on the landing board.
- **Slat Raised** (`slat-2`): Guest message entries, unlit bar segments, skeletons, ghost and secondary hover fills, and the disabled primary plate.
- **Hairline Rule** (`rule`): 1px row dividers, panel borders, and the 1px gaps between stat cells.
- **Heavy Rule** (`rule-strong`): The 2px rule under board headers, field and chip borders, the neutral status flap ("Staff"), and the unlit typing slat.
- **Muted Lettering** (`muted`): Column headers, value labels, entry labels, placeholders, helper text and disabled text (5.3:1 on slat, 4.8:1 on slat-raised).
- **Dim Lettering** (`dim`): Secondary prose such as destination copy, subtitles, sublabels, field labels and the ghost button (7.8:1 on slat).
- **Flap Ivory** (`flap`): Primary lettering on the board, including flap cells, headings, body text and guest entries (15:1 on board).

### Tertiary: the slip
- **Slip Ivory** (`slip`): The printed enquiry slip. It is used only as the background of assistant answers.
- **Slip Ink** (`slip-ink`): Text on the slip (14.7:1).
- **Slip Pencil** (`slip-muted`): Link underlines inside a slip, darkening to slip ink on hover.
- **Slip Rule** (`slip-rule`): Inline code ground inside a slip.

### Named Rules
**The One Signal Rule.** Signal amber is the only action colour. Every primary action is an amber plate with board-black lettering, and no other hue ever fills a button. Green and red are status, never action.

**The Slat Ladder Rule.** Surfaces, rules and lettering come only from the ladder board → slat → slat-raised → rule → heavy rule → muted → dim → flap ivory. Never introduce a grey from outside it. The flap cell's two leaves (see Components) are that cell's own material, not palette colours.

**The Ivory Slip Rule.** Slip ivory means "the concierge said this". It backs the welcome line, every grounded answer, and the canned fallback (`I'm sorry, I don't have that information right now.`). Nothing else is ivory-backed, and assistant answers never sit on slat.

## Typography

**Display Font:** Big Shoulders Display (with Arial Narrow, sans-serif), loaded from Google Fonts.
**Body Font:** Atkinson Hyperlegible Next (with ui-sans-serif, system-ui, -apple-system, Segoe UI), loaded from Google Fonts.

**Character:** A condensed, industrial station-board face set on hinged slats, paired with a humanist sans that puts legibility first. The display face does the theatre and Atkinson does the reading.

Google Fonts is requested with Atkinson 400/500/600/700 and Big Shoulders 800, exactly the weights the roles use.

### Hierarchy
- **Display** (800, clamp(1.6rem, 6vw, 4.25rem), line-height 1, uppercase, on flap cells): The "CINCINNATI HOTEL" wordmark on the landing board, with a smaller amber "ASSISTANT" line beneath at clamp(1.1rem, 3vw, 2rem). The not-found title uses clamp(1.75rem, 7vw, 3.5rem).
- **Headline** (800, 2rem, 1.5rem below 640px, on flap cells): Page titles such as "ADMIN DASHBOARD", board service names ("CONCIERGE", "HOTEL OFFICE" at 1.625rem / 1.375rem), the chat header wordmark (1.375rem / 1.125rem) and the station clock (2.25rem / 1.5rem, amber).
- **Numeral** (800, 2.5rem, 2rem below 640px, on flap cells): Stat strip values. Category counts use 1.125rem. Counts are left-padded to at least three cells so the board width holds as values grow.
- **Title** (800, 1.25rem, uppercase, 0.025em, no cells): Panel headings ("QUESTIONS BY CATEGORY", "KNOWLEDGE BASE").
- **Body** (400, 1rem, 1.5): Guest entries, field values and the landing lead (1.125rem at 640px and up). Slip answers use 1.625 line-height. Chat columns cap at 760px, which keeps slips under about 70ch.
- **Body small** (400, 0.875rem): Destination copy, subtitles, helper and error text, chip labels, and category names (1rem at 640px and up, weight 500).
- **Label** (600, 0.75rem, 0.16em tracking, 0.18em on the landing board, uppercase, muted): Board column headers ("SERVICE / DESTINATION / STATUS / ENTER AS"), stat names ("TOTAL SESSIONS"), "LOCAL TIME", and the entry labels "YOU" / "CONCIERGE" with the time in normal case beside them.
- **Button** (600, 0.875rem, 0.025em, sentence case): Every `Button`. Landing signal plates and the not-found home link use the **Plate** variant (700, 0.05em, uppercase).
- **Badge** (Big Shoulders 800, 0.875rem, 0.05em, uppercase): Status flaps.

### Named Rules
**The Slats Are for Names and Numbers Rule.** Flap cells carry the hotel name, page and service titles, the clock and counts. They never carry a sentence, a button label or form text. Prose, labels, fields and buttons are always Atkinson.

**The Read-Once Rule.** Flap text is read by assistive tech exactly once. As a name, it is screen-reader text plus hidden cells. As a value, the cells themselves are the text, so that the number stays the element's text content. Never let a screen reader spell a word out cell by cell.

**The Label Names a Value Rule.** The tracked uppercase label sits over a column or names the value beside or below it. It is never a kicker above a headline.

## Layout

The 4px Tailwind grid drives spacing. The recurring steps are 8px (control gaps), 16px (mobile gutter, cell padding), 20px (cell padding at 640px), 24px (section gaps, row padding) and 40px (landing nav offset).

- **Containers:** chat column 760px, landing board 1080px, admin board 1180px, not-found 720px, all centred. Gutters are 16px on phones. At 640px and up they are 24px in chat and 32px on landing and admin.
- **Breakpoints:** 640px (board columns appear, type steps up) and 1024px (admin goes to four stat cells and a two-column split).
- **Landing board:** At 640px and up, rows are a fixed four-column grid (15rem service, flexible destination, 6rem status, 11rem plate) under a muted column-header row. On phones, each row stacks as service flap, destination copy, then the amber plate. The status flap and column headers are hidden below 640px.
- **Admin board:** The stat strip is a single ruled panel whose cells are separated by 1px of rule colour (gap-px on a rule-coloured ground). It has two columns on phones and four at 1024px. Below it, the category board and the knowledge-base panel split 7:5 at 1024px and stack on phones.
- **Category rows:** At 640px and up, a 11.5rem name column, a flexible 16-segment bar, and a right-aligned flap count. On phones, the bar drops to its own line under the name and count.
- **Chat:** The page is a full-height (dvh) column with a slat header bar, a scrolling log, and a docked slat composer bar that respects the bottom safe-area inset. A short conversation anchors to the bottom, next to the composer, rather than floating at the top. Entries are capped at 85% of the column, with guests on the right and the concierge on the left.
- **Touch targets:** Every control is at least 44px (back link, buttons, inputs, plates). The composer and send button are 48px. Chips are 40px.

## Elevation & Depth

The board is flat. Depth comes from the tonal slat ladder (board below slat below slat-raised) and from rules: 1px hairlines between rows and panels, and a 2px heavy rule under every board header and panel heading. Only two physical objects cast shadows: the flap cell, which is a real hinged slat, and the ivory slip, which is paper laid on the board.

### Shadow Vocabulary
- **Flap cell** (`box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.5), 0 1px 1px rgb(0 0 0 / 0.4)`): Every flap cell, together with its two-leaf gradient and 1px black hinge line.
- **Slip lift** (`box-shadow: 0 2px 8px rgb(0 0 0 / 0.35)`): Assistant answer slips only.

### Named Rules
**The Flat Board Rule.** Panels, buttons, chips, fields and stat cells carry no shadow. If something needs to feel raised, move it one step up the slat ladder or give it a rule.

## Shapes

Corners are barely softened, like machined metal plates. The `slat` radius (3px) is used on every panel, button, plate, field, chip, slip and entry. The smaller `flap` radius (2px) is used on flap cells, status flaps, skeletons and inline code, and bar segments use 1px. There are no pills, circles or large radii anywhere. The only round form is the loading spinner.

Borders are 1px hairlines. Heavier 2px rules mark board headers. Flap cells are fixed-ratio slats (0.7em wide, 1.18em tall) split horizontally by a 1px black hinge, with words kept whole when a line wraps.

## Components

### Flap Text (signature)
The board's lettering. Each character is a flap cell: two leaves (top `#1d2126`, bottom `#15181c`) split by a black hinge line, set in Big Shoulders 800 uppercase, with 0.08em between cells and 0.42em between words. Tones are flap ivory (default), signal, go and stop.
- **Change:** When a character changes, the cell riffles through three random glyphs (55ms apart, staggered 28ms per cell), then the top leaf drops onto the new character (180ms, perspective rotateX from 70deg with a brightness flash).
- **Mount:** A page may riffle its title in on first render once. The landing wordmark and the not-found title do this. Other pages show their titles static.
- **Padding:** Counts left-pad with blank slats so the width holds.

### Buttons
- **Shape:** Machined plate (3px), 44px tall (36px small, 48px large/composer), 16px side padding.
- **Primary:** Signal plate with board lettering. Hover brightens to signal-hover. Disabled drops to an unlit slat (slat-raised with muted text), not a faded amber.
- **Secondary:** Slat with a heavy-rule border and flap text. Hover moves to slat-raised with a muted border. Used for "Replace PDF", "New conversation", "Retry" and "Try again".
- **Ghost:** Dim text with no frame. Hover fills slat-raised and lifts the text to flap ivory ("No thanks").
- **Loading:** A 16px inline spinner before the label, with `aria-busy` set.
- **Focus:** A global 2px signal outline at 2px offset on every focusable element.
- **Signal plate (landing):** The role entry on each landing row is a full-row link whose right-hand cell is an amber plate in the Plate type. It reads "Regular User" or "Admin" (uppercase by CSS) and ends in an arrow that nudges 2px right on row hover. The whole row takes a slat fill on hover.

### Status Flaps (Badges)
- **Style:** A reversed 24px plate (2px radius) in Big Shoulders 800 uppercase with board lettering. Tones are go ("Open", "Ready"), stop ("Failed") and neutral heavy rule with flap text ("Staff").
- **State:** Static labels, never interactive.

### Board Panels
- **Corner Style:** 3px.
- **Background:** Slat, with a 1px hairline border.
- **Header:** A Title-style heading on a 16px/20px padded bar underlined by a 2px heavy rule. Optional dim summary text sits on the right.
- **Internal Padding:** 16px on phones, 20px from 640px. Rows inside are divided by 1px hairlines with no rule after the last row.
- **Shadow Strategy:** None (see Flat Board Rule).

### Stat Strip
Four cells in one ruled panel, each with a muted Label, a Numeral flap value, and a dim sublabel line that reserves its height. A changed value riffles its digits and the cell flashes row-lit (a 16% signal wash fading over 1400ms). While loading, the value is a skeleton slat.

### Category Board
Eight fixed rows (the category list), sorted by count. Each row has a name (flap ivory, or muted at zero), a 16-segment bar (lit segments are signal, unlit are slat-raised, 3px gaps, and any non-zero count lights at least one segment), and a three-cell flap count. Changed rows riffle and flash row-lit. A screen-reader-only table carries the same data.

### Conversation
- **Entry label:** A muted Label ("YOU" / "CONCIERGE") with the time in normal case. It is aligned with its entry.
- **Ivory slip (assistant):** Slip ivory with slip ink, 12px/16px padding, 1.625 line-height, and the slip lift shadow. Markdown headings render as bold paragraphs, links get a slip-pencil underline, and inline code sits on slip rule.
- **Guest entry:** Slat-raised with a heavy-rule border, flap text and 10px/16px padding, right-aligned. A failed entry takes a 60% red border and dim text, with red reason text and a small secondary "Retry" button beneath.
- **Arrival:** Each new entry slides in (8px rise and fade, 240ms).
- **Typing:** A slat-raised frame holding three small flap cells that light amber one at a time (a 960ms stepped cycle, 320ms apart). It steps like a board, with no bounce.
- **Contact form card:** A slat panel with a heavy-rule border. The question sits on a ruled header bar, followed by three labelled fields (Name, Phone, Email) and a ghost "No thanks" next to a primary "Send details". On success it becomes a green-tinted status line.

### Suggestion Chips
- **Style:** A slat plate (3px) with a heavy-rule border, flap text in Body small, 40px minimum height.
- **State:** Hover turns the border and text signal amber. Disabled falls to muted text. Chips appear only before the guest's first message.

### Inputs / Fields
- **Style:** A board-black well with a heavy-rule border, 3px radius, 44px tall and 14px side padding, with flap text and muted placeholder. The textarea composer grows up to 160px.
- **Focus:** The border turns signal amber, with a 2px signal ring at 35% opacity. The caret is amber.
- **Error / Disabled:** Invalid fields take a stop border and a red message tied to the field. Disabled fields drop to slat with muted text.
- **Drop zone:** A board-black well with a hairline border. While a file is dragged over it, the border and copy turn signal and the well takes a 10% signal wash.

### Navigation
- **Landing board:** The `nav` is the departures board itself, two rows with "Regular User" → chat and "Admin" → admin.
- **Back link:** A 44px square slat plate with a hairline border and a dim arrow, which lifts to flap ivory with a heavy-rule border on hover. It sits at the left of the chat and admin headers.
- **Notices:** Board-wide errors use the red tint treatment, and the polling fallback is a quiet dim status line in the admin header.

## Do's and Don'ts

### Do:
- **Do** label the two landing role controls exactly "Admin" and "Regular User". These strings are the accessible names, and CSS may set them in capitals.
- **Do** keep the hotel name "Cincinnati Hotel" in the wordmark, headers and copy.
- **Do** show real time by riffling flap digits and the row-lit flash (16% signal wash, 1400ms) on the stat or row that changed.
- **Do** put every primary action on a signal amber plate with board-black lettering (`signal` / `board`, 10:1).
- **Do** set every assistant answer, including the welcome line and the canned fallback, on an ivory slip with slip ink.
- **Do** load Big Shoulders Display (slats) and Atkinson Hyperlegible Next (prose) from Google Fonts, and keep the fallbacks in the stacks.
- **Do** keep the accessible names the e2e suite uses: heading "Admin dashboard", link "Regular User", textbox "Message the hotel assistant", button "Send message", log "Conversation", form "Contact details", fields "Name" / "Phone" / "Email", button "Send details", the status "Thanks, our team will contact you shortly.", and the "Questions asked" label whose stat value is a paragraph with the `tabular-nums` class.
- **Do** keep every control at 44px minimum height and the focus outline at 2px signal with 2px offset.
- **Do** collapse every animation under `prefers-reduced-motion`. Flap cells then switch characters instantly.

### Don't:
- **Don't** add a "Live" badge, pulsing dot or "real-time" chip. The board moving is the proof.
- **Don't** give an action any accent hue other than signal amber. Secondary and ghost actions stay on the slat ladder. Don't make go or stop into actions.
- **Don't** put assistant answers on slat, or guest entries on ivory.
- **Don't** set sentences, button labels or form text in flap cells.
- **Don't** build the white chat column with rounded floating cards, pill bubbles or a light theme.
- **Don't** add shadows to panels, buttons, fields or chips. Only flap cells and slips cast one.
- **Don't** introduce greys outside the slat ladder, or radii above 3px.
- **Don't** let a screen reader read flap cells letter by letter.
