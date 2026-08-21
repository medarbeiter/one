# Content: a unified inbox for comments and DMs

Stand 2026-08-21. New: `app/inbox/*`, `lib/inbox-store.ts`, `lib/inbox-ingest.ts`,
`lib/inbox-send.ts`, `lib/webhook-subscribe.ts`, `app/api/webhooks/meta/route.ts`,
`app/api/inbox/count/route.ts`. Changes: `app/layout.tsx`, `app/shell/sidebar.tsx`,
`theme/icons.tsx`, `compose.yaml`, `Dockerfile`, `README.md`. Builds on the
existing `lib/inbox.ts` normalizer, which is reused rather than replaced.

## Problem

Comments and DMs across 200+ Facebook Pages and Instagram accounts are
currently triaged by hand in Meta's Business Suite. That does not scale with
the portfolio, and it is the one place left where "per-customer clicking" is
still the workflow. The goal is to replace the Business Suite for this task
entirely — read, reply, and keep track, for every client, from one screen.

## Decision

Move the inbox off "fetch everything from Graph on every request" and onto a
small local store that a Meta webhook keeps warm. `lib/inbox.ts`'s
`normalize()` stays exactly as it is — it is the one place the four Graph
shapes become one `InboxItem`-like row, and both the webhook path and the
reconciliation path feed it the same way. What changes is what happens
*after* normalization: instead of holding items in memory for one request,
they're upserted into SQLite and the UI reads from there.

This resolves the two things a live Graph fan-out can't give at this scale:
a list view that's fast and filterable across all 200+ accounts at once, and
a place for `note`/`snoozed_until` to live once they're built, without
reshaping anything.

### Storage: `bun:sqlite`, not Postgres

Bun ships SQLite in the runtime — no new dependency, no new service, no new
secret to manage. The `app` service in `compose.yaml` is a single container
with no replica count, so SQLite's single-writer model is not a constraint.
Postgres becomes the right call the day this app runs more than one replica;
nothing here calls for that yet, and building for it now is infrastructure
for a problem that doesn't exist.

The database file lives on a named Docker volume (`compose.yaml` currently
has none — this is the first feature that needs persistent state) mounted at
`/data`, path configurable via `INBOX_DB_PATH` (default `/data/inbox.sqlite`).
Schema is created on first access with `CREATE TABLE IF NOT EXISTS`, hand
written, no migration framework — two tables don't need one.

### Schema

```sql
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,           -- root comment id, or DM conversation id
  kind TEXT NOT NULL,            -- 'comment' | 'dm'
  channel TEXT NOT NULL,         -- 'facebook' | 'instagram'
  customer_id TEXT NOT NULL,
  self_id TEXT NOT NULL,         -- page id or ig-business-account id; reply target
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  context_label TEXT,            -- post caption / ad name
  context_thumbnail TEXT,
  context_ad_id TEXT,
  post_id TEXT,                  -- comments only
  answered INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL,
  expires_at TEXT,                -- dms only, see lib/inbox.ts expiresAt()
  note TEXT,                      -- reserved, unused until notes ship
  snoozed_until TEXT,             -- reserved, unused until snooze ships
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  from_self INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_activity ON threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_customer ON threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
```

`threads` is the list-pane grain: one row per top-level comment (its replies
live in `messages`) or one row per DM conversation. `answered` becomes a
stored, recomputed-on-write column here (last message's `from_self`) instead
of derived at read time — the raw Graph nesting `lib/inbox.ts` currently
walks to derive it isn't held in memory anymore.

`note` and `snoozed_until` are the extension point point 4 asked for: the
columns exist so a later feature is an `ALTER TABLE`-free read/write against
already-shaped rows, not a schema migration. Nothing writes or reads them yet
— no UI, no server action. That's the whole scope of "reserved."

## Ingestion

Two paths write to `threads`/`messages`, both going through
`lib/inbox.ts`'s `normalize()` so there is exactly one place that
understands the four Graph shapes:

**Reconciliation** (`lib/inbox-ingest.ts:reconcile()`) — the existing
`Source`-building logic (batched Graph reads per customer, same shape
`lib/inbox.ts`'s tests already exercise) run for every customer with a page
or Instagram account, `normalize()`d, and upserted. Runs via `after()` in
`app/layout.tsx`, same pattern as `ensureAssigned` — quiet, non-blocking,
self-healing. Bounded to posts from the last 90 days and conversations
updated in the last 90 days, so a 200-customer reconcile stays a bounded
batch call rather than a full-history crawl; older threads a webhook already
delivered stay in the store regardless.

**Webhook** (`app/api/webhooks/meta/route.ts`) — Meta's real-time path.
`GET` answers the one-time challenge verification with
`META_WEBHOOK_VERIFY_TOKEN`. `POST` verifies `X-Hub-Signature-256` against
`META_APP_SECRET`, then per changed entry fetches *only* the new comment or
message (not a full resync), wraps it as a one-item `Source`, runs it through
`normalize()`, and upserts. This is the low-latency path; reconciliation is
the safety net under it, not the primary path.

**Subscription bookkeeping** (`lib/webhook-subscribe.ts:ensureWebhookSubscribed()`)
— every page needs one `POST /{page-id}/subscribed_apps?subscribed_fields=feed,messages`
call (Instagram comments/messages ride the same Page subscription). Idempotent,
safe to call on every boot, same shape as `lib/assign.ts`'s
`ensureAssigned` — a new customer's page starts receiving webhooks without
anyone visiting a settings screen. Also exposed as `bun run webhooks` for a
manual dry-run report, mirroring `bun run customers`.

## Reply (write path)

`lib/inbox-send.ts`. Writes go straight to Graph — the store is never the
system of record for what was said, Meta is:

- **Comment reply** — Facebook: `POST /{comment_id}/comments {message}`.
  Instagram: `POST /{comment_id}/replies {message}`. Both `asPage: self_id`.
- **DM reply** — Facebook Messenger: `POST /me/messages
  {recipient:{id: author_id}, message:{text}}`. Instagram:
  `POST /{self_id}/messages {recipient:{id: author_id}, message:{text}}`.
  Both `asPage: self_id`. (Exact Instagram messaging endpoint gets a final
  check against current Graph docs during implementation — Meta has moved
  this once before — but the shape and permission set are already granted:
  `pages_messaging`, `instagram_manage_messages`, `instagram_manage_comments`
  are all in the README's token scopes.)
- Blocked, client and server side, when `isExpired(thread)` — reusing
  `lib/inbox.ts`'s existing 24-hour-window logic rather than re-deriving it.
  No message-tag path for replying outside the window: that is a different
  consent regime (subscription/marketing messaging) and out of scope.
- On success: append the sent message to `messages`, set
  `threads.answered = 1`, bump `last_message_at`. On failure: surface Meta's
  error text at the composer, same pattern as `campaigns/actions.ts` catching
  `GraphError` and returning `{ error }` rather than throwing.

## UI: two-pane, not table-plus-drawer

`/inbox`, inside the existing `<Blattkopf>` / `<Blatt>` shell:

- **Header** — titel "Inbox", meaning `inbox`, figur = count of unanswered
  threads in the current filter, figurEinheit "offen".
- **Filter band** — `Facets`/`FacetSelect` exactly as `/campaigns` uses them:
  channel (Facebook/Instagram), kind (comment/DM), answered state, plus the
  existing customer scope switcher and search. All server-side, all URL
  state — no client filter logic to keep in sync with the DB.
- **Left pane** — the thread list, sorted by `last_message_at`, one row per
  thread: avatar, author, channel/kind sign, preview text, relative time,
  unanswered indicator. Rows are `Link`s to `?thread=<id>` — selection lives
  in the address, like every other choice in this app (`navigator.tsx`'s
  reasoning applies here too: a shared link should reopen the same
  conversation).
- **Right pane** — the selected thread's full `messages` history plus the
  composer. For a DM past its 24h window, the composer is replaced by a
  banner stating why, not just disabled — the same "say why, not just no"
  standard `GraphError` messages already meet elsewhere in this app.
- **Scrolling** — both panes scroll independently within the page, composer
  pinned at the bottom of the right pane. This is a deliberate, narrow
  exception to "only `<main>` scrolls": the same reasoning that keeps the
  customer scope always reachable in the sidebar applies to keeping the
  filter row and the reply box always reachable in a high-volume inbox.
- **Freshness** — a thin client island (`app/inbox/poller.tsx`, same
  category as `new-campaign.tsx`/`scope-switcher.tsx`) polls
  `/api/inbox/count` every ~20s and on window focus; a changed count or
  `updatedAt` triggers `router.refresh()`. Most polls hit a warm SQLite read
  and cost nothing — the one right after a webhook fires is the one that
  actually refreshes the list. No SSE, no held connections: this app has no
  sticky-session story and doesn't need one for a 20-second-worst-case
  staleness window.

### Nav

The sidebar's `Inbox` entry and its `inboxCount` badge already exist
(`app/shell/sidebar.tsx:57,160-165`) and are exactly right — they were built
ahead of this feature. `app/layout.tsx` gets one addition: a
`countUnanswered()` read from `lib/inbox-store.ts` (a local SQLite query, not
a Graph call) passed into `<Sidebar inboxCount>`.

### New icon meanings

`theme/icons.tsx` needs `comment`, `dm`, `facebook`, `instagram`, `send` —
none of the current `MEANINGS` cover a chat bubble, a channel mark, or a
send action.

## Deployment

- `compose.yaml`: add a named volume for `/data`; add `META_APP_SECRET`,
  `META_WEBHOOK_VERIFY_TOKEN`, `INBOX_DB_PATH` (default supplied, only the
  first two are required).
- `README.md`: document the one-time step of pointing Meta's Webhooks
  product at `https://<domain>/api/webhooks/meta` with the verify token —
  this is app-level configuration done once, not a per-customer step;
  per-page subscription is what `ensureWebhookSubscribed()` automates.

## Explicitly out of scope

- **Notes and snooze UI** — columns reserved on `threads`, nothing built.
- **Assignment / multi-agent ownership** — not requested, no column reserved
  either; revisit if it comes up.
- **Message tags for replying past the 24h DM window** — different consent
  regime than this feature covers.
- **Multi-replica deployment** — would mean swapping SQLite for Postgres (or
  a shared-storage story); not needed at one container.
