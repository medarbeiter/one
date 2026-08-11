# MedArbeiter One — UX & Design Rewrite

**Date:** 2026-08-11
**Status:** Approved, ready for implementation planning
**Scope:** Full UX, IA and visual rewrite of the Meta business hub

---

## 1. Purpose

MedArbeiter One is the agency's hub for everything Meta: business assets
(ad accounts, pages, Instagram accounts), the comments and DMs those pages
receive, and the ad campaigns run for each client.

Today it is two pages — a flat asset table and a campaign list with a
12-field launch form. This document specifies the rewrite.

### The workflow it must serve

Work arrives as task bundles of two shapes:

- **Client-scoped:** "Create a campaign for customer XXX"
- **Cross-client:** "Check the comments and DMs of all Facebook accounts"

These are *the same work at two scopes*, not two different jobs. That single
observation drives the entire information architecture.

### Decisions taken during design

| Question | Decision |
|---|---|
| Does the app know about tasks (ClickUp)? | **No.** Task-agnostic. The app is where tasks send you. ClickUp integration is a later, separate decision. |
| Inbox capability | **Read + reply**, all four channels: FB comments, IG comments, Messenger DMs, IG DMs. |
| Campaign control | **Full create + edit** (pause/resume, budget, rename), plus performance metrics as columns — not a separate analytics page. |
| UI language | **English.** (The current UI is German; the rewrite switches.) |
| Navigation model | Function-first pages, **customer as a filter dimension**, not a navigation level. |

### Explicitly out of scope

Auth / multi-user · dark mode · saved filter views · ClickUp integration ·
page profile editing · resumable upload · multi-format creatives.

---

## 2. Information architecture

### Shell

```
┌──────────────────────────────────────────────────────────────┐
│ ◆ MedArbeiter One   [ All customers ▾ ]      [⌘K]  [Status●] │
├────────────┬─────────────────────────────────────────────────┤
│ Today      │                                                 │
│ Inbox  ⌐12 │   page content                                  │
│ Campaigns  │                                                 │
│ Customers  │                                                 │
│ ─────────  │                                                 │
│ Settings   │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

**Scope switcher** — searchable combo box, default *All customers*. Writes
`?customer=<id>` into the URL and is preserved across navigation. Every page
respects it. This is what lets one Inbox page serve both task shapes.

**Token health indicator** — the system-user token is the single point of
failure for the whole app. It gets a persistent dot: green (fine), amber
(a customer is missing permissions), red (token dead), with the fix in a
popover. Replaces today's behaviour of dumping a raw Graph error string into
a setup card in place of the page.

**Inbox badge** — live unread count in the sidebar, so "does anything need
me" is answered before any click.

### Pages

#### `/` — Today

Answers *what needs me now*, at the current scope. Not a vanity dashboard.

1. **Expiring soon** — DM threads inside the 24-hour reply window, sorted by
   time remaining. First on the page because it is the only thing here that
   becomes irreversible if ignored.
2. **Awaiting approval** — campaigns this app created that are still PAUSED.
   Closes the loop that `README.md` deliberately opens by never auto-activating.
3. **Stat row** — open comments · open DMs · active campaigns · spend (7 days).
4. **Per-customer table** — *only when scope = All customers*. One row per
   customer: open comments, open DMs, active campaigns, spend; sorted by
   most-waiting. **This table is the "check all Facebook accounts" task.**
   Clicking a row sets scope and opens the Inbox.

#### `/inbox` — Inbox

Two-pane: item list left, thread right.

**List row:** avatar · customer chip *(only at scope = all)* · channel icon ·
author · snippet · relative time · expiry chip for DMs.

**Thread pane:**
- The conversation or comment tree.
- **The context it belongs to** — "Comment on *Pflegekräfte Sachsen*, ad 3"
  with a creative thumbnail. Answering a recruiting comment without knowing
  which ad it sits under is guesswork.
- Reply box with the expiry clock rendered as `Reply by 14:20`, counting down.
  When the window closes the box is disabled and explains why. **The 24-hour
  limit is never discovered by failing a send.**
- Actions: Reply · Hide · Delete · Done.

**Done state — a known constraint.** The Graph API has no read/unread or done
flag for comments (conversations have `unread_count`; comments have nothing).
So `answered` is **derived**: *has the page replied in this thread?* Zero
storage, correct for roughly 90% of items. The remaining 10% are comments that
needed no reply and will keep reappearing. If that becomes annoying in
practice, add a single-column SQLite file (`done: commentId`) — not before.

#### `/campaigns` — Campaigns

| Name | Customer\* | Status | Objective | Daily budget | Spend | Impr. | CPM | Cost/result | Runtime |

\* only at scope = all.

- **Status is an inline switch** — pause/resume without leaving the row.
  Resuming opens a confirm dialog; it spends money.
- **Daily budget is inline-editable** — the most common edit, so it costs one
  click rather than a page.

**`/campaigns/[id]`** — campaign → ad sets → ads as a disclosure tree,
insights at every level, creative previews, edit in place.

**`/campaigns/new`** — the current 12-field wall becomes four steps:

1. **Customer & Objective**
2. **Audience**
3. **Creatives**
4. **Review**

with a live ad preview beside the form. The *Employment* special-ad-category
checkbox moves to step 1, because it is what disables age targeting in step 2 —
today it sits at the bottom of the form silently invalidating two fields above
it.

Campaigns are still created **PAUSED**. Going live is a deliberate, confirmed
action.

#### `/customers` — Customers

Replaces today's two bare tables (`owned_*` / `client_*` accounts and pages)
with the entity you actually think in.

One row per customer: name · logo · page · Instagram · ad account(s) ·
currency · status · access (own / client).

**`/customers/[id]`** — the customer's configuration surface: assets,
permission health, IDs to copy, links into the scoped Inbox and Campaigns.
This is where you land when a task names a customer; opening it sets the scope.

---

## 3. Filtering

Two tiers. **Every filter is a URL search param.** Server components read them
directly — no client state, no `useEffect`, the back button works, and any
filtered view is a link that can be pasted into a task comment.

**Tier 1 — Scope.** One dimension (customer), global, in the top bar,
persists across pages.

**Tier 2 — Facets.** Per page, in a filter row under the header:

| Page | Facets |
|---|---|
| Inbox | Channel (FB comment / IG comment / Messenger / IG DM) · Status (open / done) · Expiry (< 6 h) · Search |
| Campaigns | Status · Objective · Period *(drives the metric columns)* · Search |
| Customers | Access (own / client) · Status · Search |

Active facets render as removable chips alongside a *Reset all*, so filter
state is always readable on screen rather than hidden inside dropdowns.

**Skipped:** saved views, filter presets. The URL is the saved view — bookmark
it. Add real ones only after repeatedly rebuilding the same filter set.

---

## 4. Visual system

### Palette

Derived from med-arbeiter.de, with one correction.

**The correction:** `#DAA21D` against white is **2.29:1**, well below the 4.5:1
minimum. The live site puts white text on that gold (cookie banner *Akzeptieren*
button). In a data-dense tool used for hours that is both an accessibility
failure and simply hard to read. Fix: **ink text on gold fills** (7.8:1), and a
darker gold for gold-coloured *text*.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `gold-500` | `#DAA21D` | Primary fills, active nav, brand | — |
| `gold-600` | `#C08F14` | Hover | — |
| `gold-700` | `#8A6410` | Gold **text** on light | 5.4:1 ✓ |
| `gold-100` | `#FBF3DE` | Tints, selected rows | — |
| `ink-900` | `#1A1A1A` | Headings, **text on gold fills** | 7.8:1 on gold ✓ |
| `ink-700` | `#494949` | Body (site's own value) | 9.0:1 ✓ |
| `ink-500` | `#6B6B6B` | Muted, secondary | — |
| `ink-300` | `#949494` | Placeholder, disabled | — |
| `surface` | `#FFFFFF` | Cards, panes | — |
| `canvas`  | `#F9F9F9` | App background | — |
| `line`    | `#E8E8E8` | Borders, dividers | — |

### Semantic colour

| Token | Value | Meaning |
|---|---|---|
| `success` | `#0F7B4F` | Active campaign, replied |
| `danger` | `#C4342A` | Dead token, delete, expired DM |
| `attention` | `#C4342A` @ 12% tint | Expiring soon |
| `neutral` | `ink-500` | Paused, draft |

**Amber cannot mean "warning" in this app.** Amber is the brand — logo, nav,
every primary button. An expiring-DM badge in amber would vanish into the
chrome. Urgency is therefore red-tinted, and **gold is reserved exclusively for
brand and primary action**. If gold means two things it means nothing.

### Typography

**Poppins for display only** — logo, page titles, stat numbers. It is geometric
and wide; at 13px in a table of campaign names it turns to mush. Body, tables
and controls use the system UI stack: no second webfont download, better
rendering at small sizes, brand still present on every page title.

| Role | Size / weight | Family |
|---|---|---|
| Page title | 24 / 600 | Poppins |
| Section | 16 / 600 | Poppins |
| Body | 14 / 400 | system |
| Table | 13 / 400 | system |
| Meta | 12 / 400, `ink-500` | system |

**`font-variant-numeric: tabular-nums` on every metric.** A spend column that
cannot be scanned vertically is a decorative column.

Radii: 8px cards, 6px controls (matching the site). Spacing base 4px.

**Dark mode is not being built**, but all of the above ships as CSS custom
properties in `globals.css`, making it a later flip rather than a rewrite.

### HeroUI component mapping

All components below are already installed with `@heroui/react@3.2.4`.
No new dependency.

| Surface | Components |
|---|---|
| Shell | `Surface` · sidebar with `Link` · `Badge` (inbox count) · `Tooltip` |
| Scope switcher | `ComboBox` + `Avatar` |
| Token health | `Popover` + `Chip`; `Alert` when dead |
| Today | `Card` · `Table` · `Chip` · `ProgressCircle` (expiry) · `EmptyState` |
| Inbox list | `ScrollShadow` · `ListBox` · `Avatar` · `Chip` · `Skeleton` |
| Inbox thread | `Card` · `TextArea` · `Button` · `Alert` · `Menu` · `AlertDialog` · `Toast` |
| Filter row | `SearchField` · `Select` · `TagGroup` · `DateRangePicker` |
| Campaigns | `Table` · `Switch` · `NumberField` · `AlertDialog` · `Pagination` |
| Campaign detail | `DisclosureGroup` · `Tabs` · `Meter` (budget pacing) |
| New campaign | `Tabs` (stepper) · `Form` · `TextField` · `Select` · `Checkbox` · `Slider` (age) · `ProgressBar` (upload) · `Drawer` (mobile preview) |
| Customers | `Card` / `Table` · `Avatar` · `Chip` |

Two notes. The current launch form hand-rolls a native `<select>` with a
`ponytail:` comment explaining that HeroUI's `Select` would need client state —
the stepper is a client component regardless, so that shortcut retires.
And `ListBox` gives the inbox arrow-key navigation and selection state for
free, which is the reason to have HeroUI installed at all.

---

## 5. Data layer

### Module split

`lib/meta.ts` is 264 lines today and this design roughly quadruples its
responsibilities. Splitting along boundaries the pages already have:

| File | Responsibility |
|---|---|
| `lib/graph.ts` | `graph()`, token, `actId`, `batch()`, error mapping, retry. Nothing domain-specific. |
| `lib/customers.ts` | The customer join |
| `lib/campaigns.ts` | list · get · insights · update · `launch()` |
| `lib/inbox.ts` | comments + conversations → unified items, reply |

Principle: **network at the edges, pure transforms in the middle.** The middle
is what gets tested.

### The customer problem

Meta has no customer object. Ad accounts and pages arrive as two flat lists
with **no reliable Graph edge linking them** — you cannot ask which page an ad
account advertises for. Three options were considered:

- **Name matching** — fragile ("Schäkel GmbH" vs "Pflegedienst Schäkel")
- **Derive from existing ads** (`creative.object_story_spec.page_id`) — real
  signal, but only works for accounts that already ran ads, and costs a
  creative fetch per account
- **A config file** — chosen

`lib/customers.config.ts` holds roughly 18 entries:

```ts
{ id, name, pageId, igId?, adAccountIds: string[] }
```

This is data the agency knows and Meta does not. It is honest about being
manual rather than pretending to infer. To avoid typing it, extend
`scripts/assign-assets.ts` to emit a starter file by name matching, then
hand-correct once — the same spirit as the existing script.

### Fan-out and batching

At scope = *All customers* the Inbox needs, per customer: FB post comments,
IG media comments, Messenger conversations, IG conversations. That is
**≈4 × 18 = 72 requests per page load** — unusable.

Graph's **batch endpoint** takes 50 sub-requests per POST, reducing this to
two calls. A `batch()` helper belongs in `lib/graph.ts` **from day one**;
retrofitting it later means rewriting every read path.

Rate limiting (app-level and per ad account) is handled in the same helper —
retry with backoff on Graph error codes 17 and 613, in one place rather than
sprinkled through callers.

### Caching

Everything today is `cache: "no-store"` plus `force-dynamic`. Correct for two
pages, wrong for this. Read paths get a short revalidate; mutations invalidate
by tag.

**Next 16 changed the caching APIs.** Per `AGENTS.md`, read
`node_modules/next/dist/docs/` at implementation time rather than working from
memory.

### The unified inbox item

Four different Graph shapes collapse into one type. Everything downstream —
list, filters, sorting, badges, expiry clock — reads only this.

```ts
type InboxItem = {
  id: string;
  kind: "comment" | "dm";
  channel: "facebook" | "instagram";
  customerId: string;
  author: { name: string; avatar?: string };
  text: string;
  createdAt: string;
  context?: { label: string; thumbnail?: string; adId?: string };
  expiresAt?: string;   // DMs only — createdAt + 24h
  answered: boolean;    // derived: has the page replied in this thread
};
```

The normalizer that produces this is the highest-risk code in the app, and
also a pure function.

### Sources

| Channel | Edge |
|---|---|
| FB comments | `/{page-id}/posts?fields=comments{...}` |
| IG comments | `/{ig-user-id}/media?fields=comments{...}` |
| Messenger DMs | `/{page-id}/conversations` |
| IG DMs | `/{page-id}/conversations?platform=instagram` |

All four are already covered by the token scopes listed in `README.md`.

### Mutations

Server actions in `app/*/actions.ts`, each returning the existing
`{ ok?: string; error?: string }` shape from `LaunchResult`. It works; there is
no reason to introduce a second convention.

Actions requiring an `AlertDialog` confirm: **go live** (the only action that
spends money) and **delete comment**.

---

## 6. Error handling

Three tiers, replacing today's "any failure renders `<Setup>` instead of the
page":

1. **Token dead** — status dot red, alert at the top of the shell, setup
   instructions inside it. The app still renders.
2. **One customer fails** — a missing permission on one client shows inline on
   that customer's row; every other customer still renders.
   **Today `Promise.all` in `listAssets()` means one bad client blanks the
   entire page.** This is an existing bug and it gets substantially worse at
   four times the fan-out. `Promise.allSettled` throughout.
3. **Mutation fails** — toast carrying Graph's `error_user_msg`, form state
   preserved.

---

## 7. Testing

Staying with `bun test` and the shape of the existing `lib/meta.test.ts`.
No framework, no fixtures, no mocking of `fetch`.

Five pure functions, and only these:

| Test | Why |
|---|---|
| `actId` | Exists; keep |
| Customer join: accounts + pages + config → `Customer[]` | Branching logic over three inputs |
| **Inbox normalizer**: four raw shapes → `InboxItem[]` | Highest-risk code in the app |
| Expiry: `expiresAt`, `isExpired` at boundaries (23:59, 24:01) | Off-by-one here silently loses replies |
| Graph error mapping | Determines what the user sees when things break |

Network-shaped code stays untested on purpose. Testing that `fetch` was called
is a test of `fetch`.

---

## 8. Build order

Each stage leaves the app working.

1. **Design tokens + shell** — `globals.css` custom properties, Poppins via
   `next/font`, sidebar, scope switcher, token health. Existing pages keep
   working inside the new shell.
2. **`lib/graph.ts` split + `batch()` + `Promise.allSettled`** — no visible
   change, fixes the existing one-bad-client bug.
3. **Customers** — config file, join, `/customers` and `/customers/[id]`.
   The current asset table at `/` is deleted and `/` redirects to `/customers`
   until stage 7 puts Today there.
4. **Campaigns** — table with insights columns, inline switch and budget,
   `/campaigns/[id]`.
5. **New campaign stepper** — replaces `launch-form.tsx`.
6. **Inbox** — the largest stage: normalizer, batch reads, two-pane UI, reply,
   expiry.
7. **Today** — built last, because it aggregates everything the earlier stages
   produce.
