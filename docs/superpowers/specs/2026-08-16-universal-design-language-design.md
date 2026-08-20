# Universal Design Language: MedArbeiter One and Hub

One design language, spoken by two applications and by the ones after them.

## Why

MedArbeiter One and MedArbeiter Hub are sibling products of one house and do
not look like it. Hub has an articulated design system — a written canon in
`DESIGN.md`, 209 theme tokens compiled from a single source, a named motion
system, and a contrast test that fails the build when a token drifts. One has
a token block in `app/globals.css`, system fonts, one shadow, and no
gradients at all.

The goal is not to make One resemble Hub. It is to write down the language
both already half-speak, let each keep what it does better, and put the result
somewhere a third application can pick it up.

## Decisions taken

These were settled in brainstorming and are not open in implementation:

- **Astryx everywhere. HeroUI is removed from both applications.** Hub's
  `/new` login was the only HeroUI surface outside One; it converts too.
- **Tailwind stays in One.** It keeps doing layout; Astryx does components.
- **Gold means the primary action and brand presence** — not "worked time".
  One has several purposes and several main actions, so the subject-bound
  rule Hub uses cannot be the house rule.
- **Language first, package second.** Both applications learn to speak it,
  and only then is the shared part extracted.
- **Code in English, UI in German.** This governs the package and anything
  newly written or touched. Hub's existing German component names
  (`Tagesbahn`, `Monatsgitter`, `.stempel-leiste`) stay — renaming them
  would be a large cosmetic change that orphans every explanation in
  `DESIGN.md`.

## Where the two stand today

| | One | Hub |
|---|---|---|
| Components | HeroUI 3.2.4, 19 of 29 `.tsx` files | Astryx 0.2.0, 83 files (+ HeroUI in 3) |
| Tokens | `app/globals.css`, oklch, hue 87.02 | `theme/medarbeiterTheme.ts` → `theme/medarbeiter.css`, 209 tokens |
| Canon | none | `DESIGN.md`, enforced by `tests/kontrast.test.ts` |
| Ground | `oklch(94.8% 0.0015 87.02)` — near-neutral | `#faf8f3` — warm paper |
| Type | system-ui | Poppins headings, Figtree body, self-hosted |
| Gradients | none | login wash, header fade, segment fills |
| Shadows | one | low / med / high, semantic |
| Motion | 5 ad-hoc transitions; framer-motion unused | `--takt-*` × `--schwung-*`, reduced-motion gated |

Both pin the same gold: One's `oklch(78.07% 0.1511 87.02)` is Hub's
`#e1b025` in another notation.

## The language

### Ground — warm paper

`#faf8f3` body, white surfaces, warm stone neutrals. Never a cold gray
ladder. *From Hub.* This is the largest single reason Hub reads warmer;
the same gold on a neutral ground is a different colour to the eye.

### Gold — two registers

Gold does two jobs, and separating them by duty is what keeps it from going
ambiguous.

**Saturated `#e1b025` is the primary action.** It carries meaning, so it
carries the machinery:

- **Gold-Needs-An-Edge.** The fill reaches only ~2:1 on white and never
  will — the colour is fixed. Every meaning-carrying gold surface ships a
  1px inset hairline in `#8f6e06`, which clears 3:1 on every ground the
  house uses. The boundary carries the contrast, not the fill.
- **Dark-Ink-On-Gold.** Text and icons on gold are `#231a02`. White on gold
  fails AA and is forbidden.
- **Three-Golds.** Gold degrades by duty, never by taste: fill `#e1b025`,
  text and thin lines bronze `#7c5f05`, icons `#8f6e06`. Never fill-gold at
  text size, never bronze as a fill.

**Wash `#f7edd2` and its gradients are brand presence.** They say nothing,
so no contrast floor applies and they are free — headers, page washes,
atmosphere. Anything meaning-carrying that *stands on* the wash brings its
own hairline.

An application may extend the saturated register by declaring a subject in
its own `DESIGN.md`. Hub declares one: gold is also worked time. One
declares none.

### Type

Poppins headings, Figtree body, self-hosted via `next/font`. Base 14px,
ratio 1.2. Every figure that changes — times, durations, budgets, counts —
renders with tabular numerals so it does not wiggle as it ticks. *From Hub.*

### Shape — the radius ladder

Nothing is ever truly square, and the house is rounder than Hub currently
ships. Hub runs `.375 / .625 / .75`; One's cards are `rounded-xl` (`.75`)
and Hub's own HeroUI experiment reached for `.875`. Both instincts point
past Hub's values, so the ladder rounds up:

| step | value |
|---|---|
| none | 0.25rem |
| inner | 0.5rem |
| element | 0.75rem |
| container | 1rem |
| page | 1.75rem |
| full | 9999px |

*From One.* Hub changes here too — this is a house language, not a takeover.

### Elevation

Three shadows, warm-tinted `rgb(28 25 23 / …)` rather than cool gray: **low**
(cards), **med** (popovers), **high** (dialogs). Depth may carry meaning —
in Hub, only worked time lifts. *From Hub.*

### Motion — der Takt

Four durations and four curves, under one governing rule: **the exit is
faster than the entrance.** What leaves should clear the attention; what
arrives should have time to be read. Nothing is linear — constant velocity
has no counterpart in the world and reads as machinery.

Two absolutes:

- **Every motion is gated on `prefers-reduced-motion`.** No exceptions.
- **Never animate `opacity` on a content entrance.** An animation that never
  ticks — a background tab does exactly this — strands content invisible.
  Move `transform` instead; the worst case is content sitting a few pixels
  low.

*From Hub.*

### Icons — meanings, not glyphs

One vocabulary module names every meaning. Components ask for `sinn="add"`
and never for a glyph, so "edit" cannot become three different pencils
across three surfaces. A new icon is added by adding a *meaning*, and the
author sees on the way in whether that meaning already exists.
*Pattern from Hub.*

The set is **Phosphor**. *From One.* Hub's Typicons has no weight axis and
only a partial outline set, which silently degrades the solid/outline
channel that distinguishes selected from idle — Hub's own doc records this
for `mitarbeiter` and `abschluss`. Phosphor has a full weight axis and
complete outline/fill pairs, and it closes both gaps Hub wrote down as
unfixable: `Bed` for Übernachtung, `AirplaneTakeoff`/`AirplaneLanding` for
An- and Abreise.

**Icons never speak alone.** Every glyph sits beside its label and is
therefore always `aria-hidden`.

### Contrast is law, and the law is executable

4.5:1 for text. 3:1 for any non-text surface that carries meaning. Hub
already computes every pairing in `tests/kontrast.test.ts` and fails the
build on drift; that test moves into the package so a token cannot quietly
break either application.

## Phase 1 — shift the language

### The de-risking move comes first

One's Tailwind utilities (`bg-canvas`, `text-ink-700`, `border-line`,
`text-gold-700`) are declared in an `@theme inline` block pointing at
HeroUI's CSS variables. Re-point that block at Astryx's token names and
every existing file gets warm paper, the gold ladder and the warm hairlines
**before a single component is migrated**.

This is what makes the migration incremental rather than a big bang: One is
never half-broken, and each converted file lands in an application that
already looks right.

### Steps

**1. Foundation.** Install Astryx, pinned exact in both applications — it is
`0.2.0` and early. Import `reset.css`, `astryx.css` and the MedArbeiter
theme; wrap in `<Theme mode="light">`; wire Poppins and Figtree through
`next/font`. Tailwind stays and keeps doing layout.

**2. Components.** 19 of One's 29 `.tsx` files import HeroUI. Order: shell
(`layout`, `sidebar`, `scope-switcher`, `user-badge`, `token-health`,
`new-campaign`, `ui`), then data surfaces (`table-body`, `facets`,
`row-controls`), then the campaign wizard last and largest (`wizard`,
`ad-set-block`, `content-grid`, `crop-dialog`, `headline-dialog`,
`location-field`, `preview`, `receipt`, `upload-queue`, `stepper`).

The mapping is settled:

| HeroUI | Astryx |
|---|---|
| `Alert` | `Banner` |
| `Autocomplete`, `ComboBox` | `Typeahead` |
| `Modal` | `Dialog` |
| `Select` | `Selector` |
| `Separator` | `Divider` |
| `Disclosure`, `DisclosureGroup` | `Collapsible` |
| `NumberField` | `NumberInput` |
| `TextField`, `Input` | `TextInput` |
| `Typography` | `Text` |
| `Checkbox`, `CheckboxGroup` | `CheckboxInput`, `CheckboxList` |
| `DateField`, `DatePicker` | `DateInput` |
| `Dropdown` | `DropdownMenu` |
| `Tag`, `TagGroup` | `Tokenizer` (multi-select typeahead with tokens) |
| `SearchField` | `TextInput` with search affordance |

**`PowerSearch` is deliberately not adopted.** `app/shell/facets.tsx` builds
its faceted filter bar out of six HeroUI imports, and an earlier draft of this
spec proposed replacing the whole composition with Astryx's `PowerSearch`.
That was wrong. The file is a **GET form**: the browser serialises the fields
into the query string, Server Components read them directly, and every
filtered view is therefore a shareable link with working Back-button history.
`PowerSearch` is a controlled component holding client state; adopting it
would convert every filtered view from a URL into ephemeral state. The facet
bar swaps its leaf components only and keeps its mechanism.

Button, Card, Table, Slider, Switch, Tooltip, Popover, Toast, Toolbar,
Skeleton, Spinner, Avatar, Badge, Kbd, Link, EmptyState, ProgressBar and
Calendar keep their names.

Four HeroUI imports have no direct counterpart and their answers are known:

- **`buttonVariants` / `linkVariants`** (7 files) — Astryx `Button` takes
  `href` and `as`, so these become `<Button href={…} as={Link} variant={…}>`.
  Cleaner than the class-string escape hatch they replace.
- **`ProgressCircle`** — a hand-rolled SVG ring on theme tokens. The pattern
  exists as `CodeRing` in Hub's `components/zugangscode-tafel.tsx`: a track
  in `--color-border`, an arc in `--color-icon-secondary`, warning at the
  threshold. It becomes a package component.
- **`ScrollShadow`** — a CSS mask.
- **`I18nProvider`** — Hub's pattern: `locales/de.json` plus `lib/intl-de.ts`.

**3. The aliveness pass.** A deliberate pass, not a side effect of
migration: the wash gradient on the header plane, the three-shadow ladder on
cards, `--takt`/`--schwung` on every transition, press feedback on buttons,
the SVG ring for launch state. This is the part that closes the gap the
brief opened with — One has no gradients today.

**4. `One/DESIGN.md`** in Hub's format, declaring One's own extensions.

**5. Hub adopts the two changes that went One's way** — the rounder radius
ladder (a theme value, therefore cheap) and Phosphor, via a rewritten
`sinnbilder.tsx` and `theme/icons.tsx`. Then `/new` and
`components/new-ui/*` convert off HeroUI, `app/new/neu.css` is deleted, and
`@heroui/react` and `@heroui/styles` leave both `package.json` files.

This step visibly changes Hub and lands as its own reviewable change, not
smuggled in with One's migration.

**End state:** both applications speak the language; HeroUI is gone.

## Phase 2 — the package

`@medarbeiter/design`, in its own repository alongside `medarbeiter/one` and
`medarbeiter/hub`, consumed as `"github:medarbeiter/design#v1.0.0"`. Bun
resolves git dependencies natively, so there is no registry to operate and
versions are tags.

Contents, all English:

- **`theme/`** — Astryx theme source and built CSS: radius ladder, warm
  palette, shadow vocabulary
- **`motion.css`** — the takt and schwung system
- **`icons/`** — the meaning vocabulary over Phosphor
- **`components/`** — what both applications proved they need: progress
  ring, status-dot and badge vocabulary, sortable data-table wrapper, app
  shell with SideNav and account row
- **`tests/contrast.ts`** — the executable law, re-run by both applications
- **`DESIGN.md`** — the canon

**Astryx is a peer dependency.** At `0.2.0` it will break, and that break
belongs in one declared place with the applications controlling the version.

Each application keeps its own `DESIGN.md` for **extensions only** — Hub's
holds Gold-Is-Work, `Tagesbahn` and `Monatsgitter`; One's holds whatever it
earns.

Extraction happens after Phase 1 deliberately. Hub is currently the only
implementation of these patterns, and an abstraction drawn from a sample of
one fits one application.

## Verification

- **Contrast test is the gate.** Every token pairing computed against the
  4.5:1 and 3:1 floors, failing the build on drift.
- **Typecheck and `bun test`** per application, per converted file.
- **Browser comparison** of both applications before and after, available on
  request.

## Risks

**Astryx is `0.2.0`.** Early, and from Meta Open Source. Pinned exact in
both applications, peer-dep'd in the package.

**StyleX means component internals are not restylable** without a compiler
neither application runs. The sanctioned escape hatch is the doubled-selector
CSS override Hub already uses in about a dozen documented places. This limit
belongs in the canon rather than being rediscovered.

**Phase 1 step 5 changes how Hub looks.** Rounder, different icons. It is
scoped as its own change for that reason.

## Non-goals

- Renaming Hub's existing German component and class names.
- Restructuring either repository into a monorepo.
- Dark mode. Hub forces `mode="light"`; dark token slots stay dormant
  inheritance, not a supported mode.

## Phase 1 inputs (recorded 2026-08-20, Task 17)

Both applications' full suites are clean on `design/house-language-phase-1`:
One 318 pass / 0 fail (31 files), clean `tsc`, clean build (12 routes). Hub
634 pass / 0 fail (29 files), clean `tsc`, clean build (routes including
`/login` and `/new/login`). `grep heroui` on both `package.json`s returns no
output — HeroUI is fully gone from both.

**The live side-by-side comparison this section was meant to record could
not be run.** Every route in One requires an OAuth session via Hub — `/` and
every page redirect through `/anmelden`, a `route.ts` handler, not an
inspectable page (confirmed already at Task 4, Ruling 9). The no-login
constraint governing this entire migration run means no session could be
established to render One at all, so there is no "side by side" to look at
even though Hub's own `/login` route is reachable unauthenticated. **This is
the one piece of Task 17 that needs the user's eyes, not a substitute** —
recorded here rather than silently skipped.

In its place, a static comparison of both apps' compiled theme output
(`theme/house.css` in One, `theme/medarbeiter.css` in Hub — both generated
by `astryx theme build` from theme source files that both trace back to the
same design language) stands in as the best available evidence:

- **Ground colour, accent, radius ladder, shadow ladder, font stack:**
  byte-identical between the two compiled files at every token checked —
  `--color-accent`/`--color-accent-muted` (`light-dark(#e1b025, #e5bc44)` /
  `light-dark(#f7edd2, #3a3012)`), `--radius-element`/`--radius-container`
  (`0.75rem`/`1rem`), `--shadow-low`/`-med`/`-high`, `--font-family-heading`/
  `-body` (Poppins/Figtree). No drift found.
- **Primary button, field chrome, focus ring:** both apps render through the
  same installed `@astryxdesign/core` build with no component-level style
  overrides for these in either theme file, so they are identical by
  construction rather than by coincidence — there is nothing app-specific to
  diverge yet.
- **The only two token-level differences found are both pre-existing and
  already documented, not new:** `.astryx-progressbar.accent`/
  `.astryx-statusdot.accent` exist only in Hub's compiled output, matching
  Ruling 7 in the SDD ledger (Hub binds progress/status colour to worked
  time; One has no such concept and correctly has no such call site).
- **Icons:** both apps pin `@phosphor-icons/react` at the same range
  (`^2.1.10`) and both render every glyph through the same `weight`-prop
  mechanism (Task 5 for One, Task 15 for Hub), so any shared meaning name
  renders the pixel-identical SVG in both apps by construction.
- **One dependency-pinning inconsistency worth carrying into Phase 2:** this
  spec's own Risks section claims Astryx is "Pinned exact in both
  applications." That is true for One (`"@astryxdesign/core": "0.2.0"`) but
  not for Hub (`"@astryxdesign/core": "^0.2.0"`, a caret range). Worth
  reconciling once a shared package makes the two `package.json`s converge.

**Net finding:** nothing surfaced that looks like a bug. The static evidence
suggests the two applications are already token-identical everywhere Phase 1
touched. Phase 2's shared package can proceed on that basis, but the visual
side-by-side remains formally unconfirmed and should be the first thing a
human does before treating Phase 1 as fully closed.
