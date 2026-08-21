---
name: MedArbeiter One
description: Warm-paper campaign tooling where gold marks the primary action and declares no subject.
colors:
  brand-gold: "#e1b025"
  on-gold-ink: "#231a02"
  bronze-text-gold: "#7c5f05"
  gold-icon: "#8f6e06"
  gold-wash: "#f7edd2"
  warm-ink: "#1c1917"
  stone-secondary: "#67625a"
  stone-disabled: "#a8a29e"
  paper-body: "#faf8f3"
  surface-white: "#ffffff"
  muted-parchment: "#f5f2ea"
  border-hairline: "#1c191714"
  border-emphasized: "#d8d2c6"
  skeleton-wash: "#ece2c9"
  warning-orange: "#dd7200"
  warning-text: "#6e3500"
  warning-ink: "#171717"
  error-red: "#e33f4a"
  error-text: "#a50c25"
  error-wash: "#facecb"
  success-green: "#198100"
  info-blue: "#0074e2"
typography:
  heading:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  body:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
  code:
    fontFamily: "ui-monospace, 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
rounded:
  none: "0.25rem"
  inner: "0.5rem"
  element: "0.75rem"
  container: "1rem"
  page: "1.75rem"
  full: "9999px"
motion:
  beat-tap: "120ms"
  beat-step: "220ms"
  beat-draw: "300ms"
  beat-arc: "700ms"
  beat-exit: "150ms"
components:
  button-primary:
    backgroundColor: "{colors.brand-gold}"
    textColor: "{colors.on-gold-ink}"
  button-destructive:
    backgroundColor: "{colors.error-wash}"
    textColor: "{colors.error-text}"
  badge-warning:
    backgroundColor: "{colors.warning-orange}"
    textColor: "{colors.warning-ink}"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.container}"
    padding: "var(--spacing-3)"
  header-band:
    background: "gradient from {colors.gold-wash} to {colors.paper-body}"
---

# Design System: MedArbeiter One

## Overview

**Creative North Star: "Ein Blatt, ein Schritt" (One sheet, one step)**

One is the agency's console for Meta advertising: customers, campaigns, ad
sets, budgets, creatives, lead forms. It is a form-and-table application, and
the thing it is really about is *getting a long, error-prone submission
right the first time* — a campaign that leaves this app wrong costs money at
Meta before anyone notices. So the interface is built to make the state of an
unfinished thing legible: the four-step campaign wizard counts its open points
at the step rather than at the end, a step's mark says done / open / locked as
a *shape* before it says it as a colour, and every list page states its own
row count beside its heading.

The world is warm and papery, not clinical: white cards float on a
barely-warm paper body (#faf8f3) with warm stone neutrals, and one gold
gradient washes down out of the header. The tone is calm and operational,
German-only, with tabular numerals wherever a figure is compared to another
figure.

Built on Astryx components (`@astryxdesign/core`, pinned exact) with the house
theme in `theme/house.ts`; Tailwind CSS 4 does layout, Astryx does components.
The palette is not a copy of MedArbeiter Hub's — it is literally the same
data (`lib/palette.ts`, "shared verbatim with MedArbeiter Hub"), so a colour
that drifts here has drifted from the house.

**Key characteristics:**
- Gold means the primary action and brand presence. It declares no subject —
  see the first Named Rule, and read it before assuming Hub's rule applies.
- Warm stone neutrals on a paper ground, never a cold gray ladder.
- One shadow step in daily use: every Card ships `elevation="low"`.
- Poppins headings (wordmark kinship), Figtree body at 14px base, tabular
  numerals for every compared figure.
- Motion is five named beats and four curves (`theme/motion.css`), all gated
  on `prefers-reduced-motion`, and entrances move `transform` only.

## Colors

A single warm gold voice over a warm-paper neutral spine, with status colours
deliberately pushed away from the brand hue. Every hex below lives once, in
`lib/palette.ts`; `theme/house.ts` builds the Astryx theme from that data and
`lib/contrast.test.ts` asserts against the same data, so the two cannot drift.

### Primary
- **Brand Gold** (#e1b025, `--color-accent`): the primary button, the current
  step's mark and the rail behind it in the wizard stepper, selection edges in the
  asset grid.
- **On-Gold Ink** (#231a02, `--color-on-accent`): the only text or icon colour
  allowed on a gold surface. White on gold reaches 2.01:1 and fails AA.
- **Bronze Text-Gold** (#7c5f05, `--color-text-accent`): gold demoted to text
  grade — 6.01:1 on white, 5.15:1 on the gold wash. Accent text, the selected
  sidebar sign.
- **Gold Icon** (#8f6e06, `--color-icon-accent`): gold as an icon or a
  hairline. 4.77:1 on white, 4.09:1 on the gold wash — it clears the 3:1
  object floor on every ground the app uses, which is the whole reason it
  exists. The upload progress ring draws its arc in this, never in fill gold.
- **Gold Wash** (#f7edd2, `--color-accent-muted`): the accent's pastel
  surface. Brand presence, not meaning.

### Neutral
- **Warm Ink** (#1c1917): primary text — 17.49:1 on white.
- **Stone Secondary** (#67625a): secondary text, 6.05:1 on white.
  **Stone Disabled** (#a8a29e) for disabled text.
- **Paper Body** (#faf8f3): the app canvas. **Surface White** (#ffffff):
  cards, popovers, the sidebar's selected item. **Muted Parchment** (#f5f2ea):
  muted fills, `Card variant="muted"`.
- **Border Hairline** (#1c191714): default borders — warm ink at 8% alpha.
  **Border Emphasized** (#d8d2c6): the Switch and ProgressBar tracks, which
  need to read as a defined channel rather than a wash.
- **Skeleton Wash** (#ece2c9): loading placeholders. It is deliberately *not*
  the gold wash — a screenful of full-strength gold bars would announce that
  something meaningful is there before anything has loaded. #ece2c9 sits at
  1.21:1 on the paper ground — quiet, not silent.

### Status (never gold)
- **Warning Orange** (#dd7200 filled, #6e3500 text, #fad0b5 wash): warnings
  live in the orange family so a status never impersonates brand gold. The
  filled badge carries **Warning Ink** #171717 (5.53:1 on the fill) rather
  than the on-gold ink; the fill itself clears the object floor on white at
  3.24:1.
- **Error Red** (#e33f4a filled, #a50c25 text, #facecb wash): errors and
  destructive actions.
- **Success Green** (#198100 filled with white text, 5.02:1).
- **Info Blue** (#0074e2 filled with white text, 4.57:1) — info banners and
  badges only.

### Named Rules

**The Gold-Declares-No-Subject Rule.** In One, gold means the primary action
and brand presence — and nothing else. It names no part of the domain.

This is where a reader arriving from MedArbeiter Hub will expect something
that is not here. Hub's rule is *Gold-Is-Work*: there, gold is worked time
**and** the primary action, because Hub has exactly one subject and gold could
be spent on it. One has customers, campaigns, ad sets, budgets, creatives and
lead forms, and a different primary action on almost every screen. Spending
gold on one of those subjects would either pick a favourite for no reason or
make gold ambiguous everywhere else. So One extends the colour to no subject
at all. This is not a smaller version of Hub's rule; it is a different rule
reached by the same discipline — one accent, one meaning.

Two consequences you can see in the theme: `statusdot`'s `accent` variant and
`progressbar`'s `accent` variant are deliberately **not** overridden in
`theme/house.ts`. Hub binds both to worked time. Here they have no house
meaning to carry, and the comments in the theme say so at the point of
temptation.

**The Header-Band Exception.** Exactly one surface is gold without carrying
meaning: the header band (`.header-band` in `app/globals.css`), a 180°
gradient from `--color-accent-muted` through a 30% mix at 62% down to the
paper body, closed by a hairline. The action strip above it (`.leiste`) is
flat `--color-accent-muted` and reads as the top of the same wash, not as a
second surface — one exception, two elements. It is the marketing site's gold
wash brought into the product. It is allowed *because* it says nothing — no
contrast floor applies to it, and the rule is written into the CSS comment so
it survives the next edit. Anything meaning-carrying that stands on it brings
its own edge: the one gold primary button in the app ("Neue Kampagne") sits in
the strip, and `.leiste .astryx-button[data-variant="primary"]` gives it an
inset `--color-icon-accent` hairline, because gold on gold has no boundary of
its own. It remains the only such exception. A second one would make gold
ambiguous again.

**The Dark-Ink-On-Gold Rule.** Text or icons on a gold surface are always
#231a02 (8.56:1). White on gold reaches 2.01:1 and is forbidden.
`lib/contrast.test.ts` contains a test that *asserts the failure* — "white on
gold does NOT clear it — this is why the rule exists" — so the reason the rule
exists cannot quietly stop being true.

**The Three-Golds Rule.** Gold degrades by duty, not by taste: fill #e1b025,
text bronze #7c5f05, icon and hairline #8f6e06. Never use fill-gold at text
size and never use bronze as a fill.

**The Gold-Needs-An-Edge Rule.** Brand gold reaches only 2.01:1 on white and
1.90:1 on paper, and it never will — the colour is fixed. So a gold fill may
not identify anything on its own: every meaning-carrying gold surface ships a
hairline in #8f6e06, which clears 3:1 on white, paper, parchment and the gold
wash alike. The boundary carries the contrast, not the fill.
`lib/contrast.test.ts` asserts *both* halves of this permanently — that gold
fails the object floor, and that the hairline clears it on every ground.

**Contrast floors are law.** 4.5:1 for text, 3:1 for any non-text surface that
carries meaning. `lib/contrast.test.ts` computes the pairings the house rules
turn on (23 tests) and fails the build if a token drifts — not yet every
pairing the UI ships; the destructive button's own error-text-on-error-wash
pairing (quoted below) isn't among them. Two floors are
deliberately *not* applied, each with its reason written down: the gold wash
and the header gradient (they carry no meaning) and the skeleton fill (it is
`aria-hidden` and states nothing).

**The Destructive-Is-Pastel Rule.** White on filled error red reaches only
4.14:1, below the text floor. So the destructive Button variant is overridden
in `theme/house.ts` to the pastel treatment — error wash #facecb with dark
error text #a50c25 (5.51:1) — not a filled red. Filled error red survives only
as a *graphical* fill (badge, dot, border), where the 3:1 object floor applies
and it passes.

## Typography

**Heading font:** Poppins (weights 500/600/700) — wordmark kinship with the
MedArbeiter logo.
**Body font:** Figtree — long-form legibility at data density.
**Code font:** the `ui-monospace` stack.

Both are self-hosted through `next/font` in `app/layout.tsx`: no runtime
request to Google, no CDN failure mode, and no client IP leaving the house.
They reach the theme through the `--font-poppins` / `--font-figtree` CSS
variables, and Tailwind's `font-display` / `font-sans` utilities are mapped
onto the Astryx families in the `@theme inline` block, so a heading set in
Tailwind and a heading set by an Astryx `Heading` are the same typeface.

**Scale:** base 14px, ratio 1.2, generated by the Astryx typography scale.
h3 and h4 are explicitly bold (theme override) so subsection hierarchy holds
in dense wizard steps.

### Named Rules

**The Tabular Numbers Rule.** Any figure that is read against another figure —
a step counter, a row count, a character counter under a headline field, a
budget, an open-points chip, an upload count — carries `tabular-nums`. Numbers
never wiggle as they tick.

**The German Voice Rule.** UI is German-only; code is English. Identifiers,
file names and this document are English; every user-visible string is German
(`lang="de"` in `app/layout.tsx`). Comments follow the file's audience rather
than a single rule: German in application code (`app/`), English in the
design-system layer (`theme/`, `lib/palette.ts`, `lib/contrast.test.ts`,
`app/shell/ui.tsx`) — this document is written from that second audience, not
a house-wide comment convention. Astryx's own built-in strings are
covered by a catalog in `locales/de.json`, supplied through
`InternationalizationProvider locale="de"` in `app/providers.tsx` — without
it, Astryx falls back to its bundled English and the search field's clear
button reads "Clear Suche". **Any new built-in string an Astryx component
surfaces must be added to that catalog, never left English.**

One string escapes the catalog and is a known gap: Astryx's `FieldLabel`
renders the literal `'Optional'` / `'Required'` from
`src/Field/FieldLabel.tsx:180` — it does not go through the message catalog,
so `isRequired` currently prints English "Required" beside four German labels
(`wizard.tsx:576`, `wizard.tsx:777`, `ad-set-block.tsx:718`,
`location-field.tsx:114`). Hub avoids this by never using the prop. Here it is
in use, so it is recorded as a defect rather than a rule: either drop the prop
and say requiredness in German copy, or get the string into the catalog
upstream.

**Money and dates are formatted, never concatenated.** `Intl.NumberFormat`
with an explicit locale at every money site, and `lib/intl-de.ts` is imported
*first* in `app/layout.tsx` so German is the default for `Intl.DateTimeFormat`
before anything formats a date. "17.00 €" beside "17,00 €" reads as two
different amounts.

## Layout

**A fixed shell, one scrolling column.** `app/layout.tsx` is a flex row on a
`h-full overflow-hidden` body: a 240px sidebar on the left, and to its right a
single `overflow-y-auto` `<main>`. Only the main column scrolls, and it has no
padding of its own — the gold has to reach the window edge, so every band
inside it pads itself.

- **The sidebar** is hand-built Tailwind (`app/shell/sidebar.tsx`), not Astryx
  `SideNav`: the logo mark, four destinations (Heute, Inbox, Kampagnen,
  Kunden), and a footer holding the user badge and the token-health chip. The
  selected item is white surface + `shadow-surface` + bronze sign; the rest
  are stone on paper.
- **The customer scope survives every navigation.** Every sidebar link carries
  the current `?customer=` through. A scope that resets on navigation is not a
  scope.

**The strip floats, it does not sit.** `app/shell/leiste.tsx` is the first
thing inside `<main>` and is `position: sticky` — *inside* the scroller, not
above it. That is the whole trick, ported from Hub's `.stempel-leiste`: at rest
the strip and the header band beneath it are one uninterrupted gold field, and
only once the page scrolls does the strip earn a border and `--shadow-low` and
come loose from it. The state comes from an invisible 1px sentinel and an
`IntersectionObserver` (`data-schwebt`), not from a scroll listener — a
listener fires on every frame of every scroll to answer one boolean.

The strip carries, left to right: the search trigger, the customer scope
switcher, and — pushed right by `ml-auto` — the app's one gold primary action.
Everything in it clears 44px, and buttons take a 0.965 scale on `:active`
(dropped under `prefers-reduced-motion`).

**The search is one field and it cuts on the server.** ⌘K anywhere opens
`app/shell/suche.tsx`, an Astryx `CommandPalette` over `/api/suche`
(`lib/suche.ts`). It finds two things: the ways through the house — the same
destinations as the sidebar — and customers. Ways rank first, because someone
typing "kamp" wants the campaign list, not a customer who happens to be named
that. Typing debounces 180ms and every in-flight request is aborted by the
next. The cut happens server-side: shipping 200+ customers into the bundle to
show six of them would be paid for at every keystroke.

**Every page is a band and a sheet.** `app/shell/blattkopf.tsx` holds both:
`<Blattkopf>` is the gold header band, `<Blatt>` the paper sheet under it, and
both cap at 1180px so a dense table stops widening on a 1900px screen. The
band's grammar never varies between views — sign + title, then **one** figure
with its unit, a supporting line of state, badges and tools on the right, and
the navigator at its foot. What used to be a heading plus a count Badge is now
that figure: the campaign list leads with spend, the customer list with the
number of customers, a customer sheet with no figure at all, because "how
many" is not the question you ask a customer.

**The figure rolls, it does not blink.** `app/shell/zahlwert.tsx` keys the
number by its own value, so a new value is a new DOM node and the CSS
animation runs again: 0.18em up from below at `--beat-step`, no overshoot —
the value is being written forward, not thrown. A number that is simply
swapped tells you something changed but not that it is the *same* number with
a new value. No fill mode: if the animation never ticks (a background tab),
the resting state is the readable one. Dropped under `prefers-reduced-motion`.

**Tabs are views, selects are filters.** The navigator at the foot of the band
(`app/shell/navigator.tsx`) carries what changes *which numbers you are
looking at*; the `Facets` row on the sheet carries what *cuts the list down*.
The period picker moved from the second to the first (`app/campaigns/
period-nav.tsx`) — it was never a filter. Its choice lives in the URL and
carries every other parameter along; because a GET form rewrites the whole
query on submit, the facets row keeps the period as a hidden field or filtering
would silently reset it. The open tab wears its sign solid, the others outline.

**List pages are one grammar.** `Blattkopf` (figure = the one number of the
list), then inside `<Blatt>`: a `Facets` filter row and a
`<Card elevation="low" padding={0}>` wrapping an Astryx `Table`. The card drops
its own padding so the table reaches both edges; the card supplies the chrome,
because Astryx's `Table` has no surface or elevation of its own. `loading.tsx`
renders the same band with a skeleton in place of the figure — a page that
loads without its band jumps by the band's full height when the data lands.

### The campaign wizard

`/campaigns/new` is the app's most elaborate surface and its own small system.
Four steps — **Kunde · Anzeigen · Details · Überprüfung** — inside a single
`<Card elevation="low" padding={0}>`: the stepper reaches both card edges, the
step content pads itself at 24px, and a footer strip closes the card.

Four decisions hold it together:

- **The count stands at the step, not at the end.** Each step carries its own
  open-point count (`stepIssues`), shown as a small error-red chip on the
  stepper and echoed beside the forward button. Discovering a missing lead
  form after eight uploads is the failure this prevents.
- **State is a shape before it is a colour.** The stepper's mark is a
  tick (done), a number (open) or a padlock (locked) — never colour alone.
  Everything after the customer choice depends on the customer, so steps 2-4
  are genuinely locked until one is chosen, and the padlock says so.
- **The forward action never moves.** One footer, `Zurück` on the left, the
  forward button on the right, becoming `Erstellen (pausiert)` on the last
  step. Before this, the main action sat somewhere different on each step.
- **The stepper is a rail, not four fields.** Each step hugs its own content
  and the space between two steps is a connector: gold for what is behind
  you, `--color-border-emphasized` for what is ahead. Under `flex-1` the four
  labels sat in four 290px cells with 200px of nothing between them — four
  loose words rather than a way through. The current mark also carries a
  gold-wash halo, because below `sm` the labels are gone and the mark is the
  only thing left to say where you are. The rail carries no rule under it: the
  step head's own `Divider` follows 20px later, and two lines that close in on
  each other turn a heading into a table row.
- **Every pair of facts is a divided list.** The choice behind step 1, the
  review summary, the fixed settings and the launch receipt are all one
  `List hasDividers density="spacious"`, label in stone on the left and value
  in ink at the right edge. Before this they were an Astryx `MetadataList` with
  no line between the rows: across half a card's width, nothing said which
  value belonged to which label — which is the one question a rule between rows
  answers.
- **Information sits on parchment; input stays white.** Every such list lives
  in an `Infotafel` (`app/campaigns/new/angaben.tsx`): muted parchment, one
  hairline, no shadow. Read-only facts in a white bordered box next to white
  bordered fields are four boxes that look alike, and each one has to be read
  before you know it wants nothing from you. Tone is the house's word for "not
  yours to turn" — the same fill the wizard footer and the ad-set summary
  already use.
- **Steps enter from below, and only by transform.** `.step-enter` animates
  `translate3d(0, 12px, 0)` over `--beat-draw` with `--ease-in`. Each step is
  a separate conditional expression in the same parent, so React genuinely
  mounts and unmounts it and the animation restarts by itself — no `key`
  needed.

The stepper is deliberately **not** a `TabList`. Tabs are four equal views of
one thing; a wizard has an order, a progress and steps that are not yet due.
"Schritt 2 von 4" is not a tab — Astryx says the same in TabList's own best
practices ("don't use tabs for sequential steps or workflows"), and ships no
stepper, which is why this one is hand-built. (The HeroUI `Tabs.Indicator` it
replaced also painted its pill over the neighbouring label, which is how
"1. Kunde" came to read "1. Ku".) Below the `sm` breakpoint the labels drop out
and a line under the marks names the current step in words instead.

Every step opens with the same head: the question, the sentence under it, then
a `Divider`. Without the rule the question sat the same 24px from the first
field as any field sits from the next, and a step read as one long stack of
equal blocks rather than a heading and its work.

Spacing rides the Astryx `--spacing-N` scale; the theme tightens `Card` and
`Section` padding to `--spacing-3`.

## Elevation & Depth

Depth is quiet and structural: white surfaces on the tinted paper body, warm
hairlines doing most of the separation, and one soft two-layer drop.

### Shadow vocabulary
- **Low** (`0 2px 4px oklch(0 0 0 / 5%), 0 4px 8px oklch(0 0 0 / 10%)`):
  cards. The inset layer in the token is `light-dark(transparent, …)` and is
  therefore invisible in the shipped light mode.
- **Med** (`0 2px 4px / 5%, 0 4px 12px / 10%`): popovers.
- **High** (`0 4px 6px / 10%, 0 12px 24px / 15%`): modals and dialogs.
- **Inset rings** (2px inset): hover `#e1b0254D`, selected `#7c5f05`, success
  `#1981004D`, warning `#dd72004D`, error `#e33f4a4D`.

**The One-Step Rule.** Every one of the twelve `<Card>` call sites in `app/`
declares `elevation="low"` — including the nested `variant="muted"` cards
inside the wizard. Med and High belong to Astryx's own overlay components
(popover, dialog), which set their own elevation. A card that lifts higher
than its neighbours is claiming an importance the app does not have a use for:
these are all just surfaces holding a form or a table.

## Shapes

Nothing is truly square: even `--radius-none` is 0.25rem. The ladder runs
inner 0.5rem → element 0.75rem → container 1rem → page 1.75rem → full pill.
Cards take container radius; step marks, count chips and the progress ring
are full-radius. Tailwind's `rounded-lg` / `rounded-xl` / `rounded-2xl` are
remapped in `@theme inline` onto element / container / page, so a radius
written in Tailwind and a radius written by Astryx are the same radius.

This ladder is rounder than the Astryx default and is the house ladder; Hub
adopts it as a separate change.

## Components

Astryx's exports are flat, not compound. `app/shell/ui.tsx` is a re-export
barrel that renames where Astryx merely spells something differently and
**refuses to wrap where the shape genuinely changed** — its own header says
"nothing here fakes a shape Astryx does not have". Alert→Banner and Chip→Badge
are shape changes (children became props), so the call sites name `Banner` and
`Badge` directly. That refusal is the pattern: a compatibility wrapper hides a
difference forever.

### The StyleX limit

Astryx ships precompiled StyleX CSS and there is no StyleX compiler in this
project. **Component internals are not restylable.** No `className` reaches
inside a component, and there is no theme key for most of what is in there.

Worse, and this is the part that gets rediscovered the hard way: the cascade
layer order in the built stylesheet is

```
properties, theme, base, components, utilities, reset, astryx-base, astryx-theme
```

Tailwind declares its own `@layer theme, base, components, utilities;`, but
nothing orders those layers against Astryx's `reset` / `astryx-base` /
`astryx-theme`, so the two groups interleave by first appearance in
`app/globals.css`'s import order — which puts **`astryx-base` after
Tailwind's `utilities`**. Combined with StyleX's
`:not(#\#)` specificity boosting, **an Astryx declaration beats the equivalent
Tailwind utility.** Tailwind only wins where Astryx emits no declaration for
that property. `<Card className="p-0">` does nothing; `<Card padding={0}>` is
the real API. Reach for the component's prop first, always.

The one sanctioned escape hatch is a **doubled-selector, unlayered override in
`app/globals.css`, with a comment saying why**. Unlayered rules outrank every
`@layer`, and doubling the class carries enough specificity to survive
StyleX's boost. Exactly one ships today:

```css
.collapsible-wide-trigger.collapsible-wide-trigger > button > span:first-child {
  flex: 1 1 auto;
  min-width: 0;
}
```

Astryx's `Collapsible` puts the whole trigger in one content-sized `<span>`
and pushes the chevron out with `space-between`; the wizard's ad-set headers
carry a name, an address, an ad count and an open-points chip, and the two
counters belong at the right edge. The span has to be allowed to grow. Astryx
emits no `flex-grow` or `min-width` there, so the rule is additive rather than
a fight — which is the bar a new override has to clear before it is written.

### Buttons
Astryx's `Button` defaults to **`variant="secondary"`**, so a bare `<Button>`
is not the primary action. Say `variant="primary"` when you mean it.
- **Primary:** brand gold with dark ink. One ships today — "Neue Kampagne" in
  the header band, the app's single standing primary action.
- **Secondary:** bordered neutral. The workhorse; most buttons in the wizard.
- **Ghost:** low-key utility actions ("Alle zurücksetzen", "Abmelden", a
  row-level retry).
- **Destructive:** the locked pastel treatment from the theme — error wash
  background with dark error text, never a filled red.

### Badges
Semantic badges are filled saturated chips: info blue, success green and error
red with white text; warning orange with dark ink #171717. Categorical badges
are pastel surface plus dark coloured text via the per-hue tokens.
`variant="neutral"` deliberately mirrors the gray categorical badge, sourced
from the same tokens so one change moves both. `Badge.label` is a `ReactNode`,
so a bare number is legal — count badges pass one and add `tabular-nums`.

There is no gold badge and there will not be one; neutral is the intended
fallback where a count wants attention without claiming to be the action.

### Banner
Hue-tinted pastel surface with matching dark coloured text, used inside a page
where the message belongs to the thing it sits above — a restored draft, a
customer whose page has not accepted Meta's lead terms, a failed upload. The
theme redirects each status's text and icon to the `--color-text-{hue}` stop
and forces the inner header's `--color-accent-muted` transparent so the outer
tint shows through cleanly. `Banner.title`/`description` are `ReactNode`, so a
sentence with emphasis in it does not need a workaround.

### Cards
White, container radius, `elevation="low"`, theme padding `--spacing-3`. Cards
are the only wrapper — no panel inside a panel. `padding={0}` is how a card
hands its edges to a table or a stepper. `variant="muted"` gives the parchment
fill used for read-only summaries inside the wizard.

`CardHeader` / `CardContent` in the barrel are bare `<div>`s carrying **no
classes of their own**, deliberately: a default class there would silently
fight the call site's utilities, and Tailwind resolves by stylesheet order,
not by who wrote the class last.

### Inputs and fields
Astryx defaults on white; status borders and icons ride the global
success/error/warning tokens, all combinations verified against the 3:1
non-text floor. `FieldsetSection` is a small markup helper, not an
Astryx component — Astryx has no `Fieldset`. It is currently defined
separately in `wizard.tsx` and `ad-set-block.tsx` rather than shared from one
place.

`TextInput` has no built-in character counter, and the `description` prop is
not a substitute: `isLabelHidden` hides the description along with the label,
which would produce a counter nobody sees until the field is already too long.
Counters are therefore rendered visibly beside the label, in one pattern.

### Typeahead
The house's search-and-pick control — customer, ad account, Instagram account,
location, lead form. Astryx's `Typeahead` *is* the search field, so there is no
trigger-plus-popover-plus-inner-search detour, and `hasEntriesOnFocus` opens
the full list on focus. It filters through a `SearchSource` rather than a
`filter` prop, which is what keeps `fuzzyCustomerMatch` alive — typed
shorthands like "hkps" find "Häusliche Krankenpflege Schölzke", which a plain
substring match would not.

### Collapsible / CollapsibleGroup
`Collapsible` renders its own chevron with its own rotation transition — do
not hand-roll one. **It defaults `defaultIsOpen` to `true`**, so a standalone
disclosure that should start closed must say `defaultIsOpen={false}`.
`CollapsibleGroup` renders no DOM at all unless `hasDividers` is set, so
spacing classes cannot ride on it; put them on a `<div>` inside. Trigger
padding comes only from the group's `density` (`spacious` = `--spacing-3`),
not from a hand-rolled `py-*` that would lose to Astryx anyway.

*Known cost:* HeroUI wrapped the trigger in a real heading element; Astryx's
trigger is a bare `<button>`, so these disclosures no longer contribute to the
document outline. There is no Astryx prop for it and no CSS fix — recorded
rather than papered over.

### Table
Astryx's `Table` **is** the `<table>`; there is no card wrapper component, no
`renderEmptyState`, and `TableRow` takes no `href`. Chrome comes from a
surrounding `<Card elevation="low" padding={0}>`, the empty row is rendered by
`app/shell/table-body.tsx`, and a row link lives inside a cell. The first data
cell of each row carries `scope="row"`.

### Progress
`ProgressBar` for the launch run — indeterminate until the server knows how
many calls are coming, because a bar sitting at 0% looks like a hang and that
is exactly when someone creates the same campaign twice.

`ProgressRing` (`app/shell/progress-ring.tsx`) is hand-drawn SVG, because
Astryx ships no circular progress and an upload
row needs a figure that does not claim a full row. Its geometry is SVG's own
measure; its colours are tokens. The arc is `--color-icon-accent`, never the
gold fill — the arc carries meaning, so it takes the gold that clears 3:1.
It takes an optional `label`: pass it when the ring is the only thing stating
the progress, omit it when visible text beside it already says the same, and
it renders `aria-hidden` instead of announcing the number twice.

### Toast — the one inverted surface
`useToast` (upload batches, campaign row actions) renders on
`--color-background-inverted`, and it is the only place in this app where
light type sits on dark. Astryx's default inverted surface is a cool
blue-black (#0A1317); in a house built from warm paper that would be the only
cold tone in it, so the theme uses the house ink #1c1917 instead.

Everything that sits on that surface is declared explicitly in the theme's
`onDark` block rather than left to `color-scheme` to work out — **because it
does not.** Astryx's `MediaTheme` flips `color-scheme` and every `light-dark()`
pair is meant to follow, but a custom property resolves where it is *declared*
(at `:root`, i.e. light), not where it is used. Left alone, the ink surface
would carry stone #67625a at 2.89:1 and bronze #7c5f05 at 2.91:1 — unreadable,
and exactly the class of bug the contrast test exists to catch.

`useToast` also needs its `ToastContext` as an ancestor. A bare viewport
mounted as a sibling of `<main>` provides context to nothing and `useToast`
silently escapes into a detached React root — outside the German catalog.
`app/providers.tsx` wraps the whole tree in `LayerProvider`, inside
`InternationalizationProvider`, and that is where it has to stay.

### Icons

Two vocabularies coexist today, and this is a known split rather than a
design:

- `theme/icons.tsx` — **the intended one.** One module names every meaning
  the application has (`<Sign meaning="add" />`), over Phosphor. Call sites ask
  for a *meaning*, never a glyph, so "edit" cannot become three different
  pencils across the campaign list, the wizard and the customer sheet — and
  the author finds out on the way in whether that meaning already has a sign.
  The form axis carries selection: `solid` means running / chosen / selected,
  `outline` the opposite. Three files use it.
- `app/shell/icons.tsx` — nine hand-drawn inline SVG paths on a 24 grid in
  `currentColor`, used by the sidebar, the facet bar and the primary button.

Three further files still import Phosphor glyphs directly. New icons belong in
`theme/icons.tsx` as meanings; the other two routes are legacy.

Named rules, which hold across all three:
- **Icons never speak alone.** Every glyph sits beside its label and is
  therefore always `aria-hidden`. Nothing in this UI is stated by an icon only
  — which is also why the stepper's padlock has a German `aria-label` behind
  it rather than a tooltip.
- **Colour is inherited.** A sign inside a gold primary button takes the
  button's dark ink automatically, so Dark-Ink-On-Gold holds without being
  restated at the call site.

### Scroll affordance
`.scroll-fade` in `app/globals.css` replaces HeroUI's `ScrollShadow`: a mask
gradient at the top and bottom edge of a scroll container shows that a list
continues, with no wrapper component and no JavaScript. Used on the asset
grid, the headline picker and the ad-set list.

## Motion

`theme/motion.css` is the one motion system: five beats and four curves, and
no motion in this application may be built from anything else.

| Beat | Duration | For |
|---|---|---|
| `--beat-tap` | 120ms | a press, a hover — immediate feedback |
| `--beat-step` | 220ms | one state changing in place |
| `--beat-draw` | 300ms | something building up or overlaying |
| `--beat-arc` | 700ms | the one written-out entrance, used sparingly |
| `--beat-exit` | 150ms | every exit, without exception |

Curves: `--ease-in` (arriving, exponential settle), `--ease-out` (leaving,
accelerates out), `--ease-move` (changing place, soft at both ends),
`--ease-spring` (a single damped overshoot, ceremonial only). **None of them is
linear** — constant velocity has no counterpart in the physical world and
reads as machinery. And **the exit is always faster than the entrance**: what
leaves should clear the attention, what arrives should be given time to be
read.

**Everything is gated on reduced motion**, concretely: a universal-selector
rule in `theme/motion.css` collapses `animation-duration` and
`transition-duration` to `0.01ms !important` and pins
`animation-iteration-count: 1`. Because it is a `*` selector it also covers
StyleX-generated rules inside Astryx components, which is why converting a
component never costs its reduced-motion behaviour and why `.step-enter`
needed no override of its own.

**Never animate `opacity` on a content entrance.** A background tab never
ticks the animation, and content that entered by fading would be stranded
invisible. `.step-enter` moves `transform` only; its worst case is a step
sitting 12px low.

## Do's and Don'ts

### Do
- **Do** use brand gold #e1b025 for the primary action and for brand presence,
  and nothing else. If you are reaching for gold to mean a *thing*, you have
  found Hub's rule, not One's.
- **Do** put dark ink #231a02 on every gold surface, bronze #7c5f05 wherever
  gold has to act as text, and #8f6e06 wherever gold has to act as a line.
- **Do** give every meaning-carrying gold surface a #8f6e06 hairline. The fill
  will never clear 3:1 on its own.
- **Do** add every new colour pairing to `lib/contrast.test.ts` in the same
  change that introduces it.
- **Do** say `variant="primary"` explicitly — Astryx's `Button` defaults to
  secondary.
- **Do** reach for the component's own prop before a Tailwind utility;
  `padding={0}` works where `p-0` silently loses.
- **Do** register every new Astryx built-in string in `locales/de.json`.
- **Do** set every compared figure in `tabular-nums`.
- **Do** state an unfinished thing's open count *at* the thing, the way the
  wizard's stepper does.

### Don't
- **Don't** use gold or yellow for a status — warnings are orange (#dd7200
  filled / #6e3500 text), and a yellow warning would impersonate the brand.
- **Don't** use white text on gold; 2.01:1 fails AA. Don't use white on filled
  error red either (4.14:1) — destructive is the pastel treatment.
- **Don't** bind gold to a subject — no gold StatusDot for "active", no gold
  progress bar for "spend". The theme leaves both `accent` variants
  unoverridden on purpose.
- **Don't** ship dark-mode surfaces. The house is light only; the dark halves
  of the token pairs are dormant theme inheritance, not a supported mode.
  ⚠️ This is currently an *intent* and not an enforced mechanism: Hub pins it
  with `<Theme mode="light">`, but One has no equivalent — the generated
  `theme/house.css` sets `:root { color-scheme: light dark }` and only
  `html[data-theme="light"]` would pin it, which nothing sets. A visitor whose
  OS is in dark mode resolves the dark half of every `light-dark()` pair, and
  those values are not contrast-tested. Pin it before treating this line as
  true.
- **Don't** add a compatibility wrapper that fakes a shape Astryx does not
  have. Change the call site instead — `app/shell/ui.tsx` documents each
  refusal and why.
- **Don't** reach inside an Astryx component with CSS unless the prop route is
  genuinely absent. When you must, use a doubled-selector unlayered override
  in `app/globals.css`, verify it collides with nothing Astryx emits, and
  write the reason above it.
- **Don't** animate `opacity` on a content entrance; animate `transform`.
- **Don't** invent a sixth beat or a fifth curve. If a motion needs a duration
  that is not in `theme/motion.css`, the motion is wrong before the number is.
- **Don't** use Astryx `FieldLabel`'s `isRequired` / `isOptional` while they
  still print English — say requiredness in German copy instead.
- **Don't** raise a card above `elevation="low"`. Med and High belong to
  overlays, which set their own.
- **Don't** build a wizard step out of tabs. A wizard has an order and steps
  that are not yet due.
