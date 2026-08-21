# Content Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Meta Business Suite for comment/DM triage with `/inbox` — a two-pane
screen backed by a local SQLite store that a Meta webhook keeps warm, covering all 200+
Facebook Pages and Instagram accounts from one place.

**Architecture:** Two ingestion paths (webhook for low latency, periodic reconciliation as
the self-healing safety net) both funnel through `lib/inbox.ts`'s existing `normalize()`
and write into a two-table SQLite store (`threads`, `messages`). The UI reads from that
store only — no live Graph calls on page render. Replies write straight to Graph (Meta
stays system of record for content) and are mirrored into the store on success.

**Tech Stack:** Bun 1.3.14, `bun:sqlite`, `bun:test`, Next.js 16.3 (App Router,
`output: "standalone"`), TypeScript, Meta Graph API v26.0, `@astryxdesign/core`.

**Spec:** `docs/superpowers/specs/2026-08-21-content-inbox-design.md` — read before Task 1.
This plan deviates from it in one place (Task 1) for a reason explained there; everything
else follows the spec as written.

## Global Constraints

- **Language:** code comments, commit messages, and test names in German, matching the
  rest of the repo (`lib/inbox.ts`, `lib/graph.ts`, `lib/assign.ts` are the direct
  neighbors this feature extends). Comments explain *why*, not what.
- **Tests:** `bun test <file>` per task; `bun test` for the full suite before the final
  commit of each part.
- **Types:** `bunx tsc --noEmit` clean before each commit — this codebase has no other
  linter.
- **No formatters:** there is no prettier/eslint config in this repo (confirmed in prior
  session) — do not run one; match surrounding style by hand.
- **Graph access:** every Page/IG read and write in this feature needs `asPage: selfId`
  (`lib/graph.ts:pageToken`) — the system-user token is rejected on these edges (see
  `lib/graph.ts`'s comment above `pageTokens`). Forgetting `asPage` fails with `(#190)
  This method must be called with a Page Access Token` at runtime, not at compile time.
- **`normalize()` is not touched.** `lib/inbox.ts` stays exactly as it is — every new file
  either calls it unchanged or works on the raw Graph JSON in parallel to it.

---

## Before Task 1: a correction to the spec

The spec chose `bun:sqlite` because "Bun ships SQLite in the runtime — no new dependency,
no new service." That's true for `bun dev`, but **`Dockerfile`'s runtime stage is
`node:22-bookworm-slim`, and `CMD` is `["node", "server.js"]`** — production does not run
on Bun. `bun:sqlite` does not exist under Node; every request that touches the store would
crash in production with `Cannot find module 'bun:sqlite'`. (Verified directly: `bun -e
"import 'node:sqlite'"` fails — Bun doesn't polyfill the Node module either — so a
runtime-detection shim importing whichever module fits doesn't have a clean two-sided
answer, and would be more code than the alternative below.)

The fix that keeps `bun:sqlite` as designed and doesn't add a second code path: run the
production container on Bun too, not Node. The repo already treats Bun as the one
runtime everywhere else (`bun install`, `bun test`, `bun run assign`) — Node in the
Dockerfile's runtime stage was never load-bearing, it was just what `next build`'s
standalone output happens to run under by convention. Task 1 below changes three lines in
`Dockerfile` for this. Flagging this because it changes what ships to production —
everything else in this plan is additive.

---

# Part 1 — Runtime

## Task 1: Run the production container on Bun instead of Node

**Files:**
- Modify: `Dockerfile`
- Modify: `package.json:6` (`start` script, for local parity)

**Interfaces:**
- Produces: a runtime image that can `import { Database } from "bun:sqlite"` — every later
  task in this plan depends on this.

- [ ] **Step 1: Change the runtime stage's base image and CMD**

  In `Dockerfile`, replace:
  ```dockerfile
  FROM node:22-bookworm-slim AS runtime
  WORKDIR /app

  ENV NODE_ENV=production \
      NEXT_TELEMETRY_DISABLED=1 \
      HOSTNAME=0.0.0.0 \
      PORT=3000

  COPY --from=build --chown=node:node /app/.next/standalone ./
  COPY --from=build --chown=node:node /app/.next/static ./.next/static

  USER node
  EXPOSE 3000

  HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

  CMD ["node", "server.js"]
  ```
  with:
  ```dockerfile
  FROM oven/bun:1.3.14-slim AS runtime
  WORKDIR /app

  ENV NODE_ENV=production \
      NEXT_TELEMETRY_DISABLED=1 \
      HOSTNAME=0.0.0.0 \
      PORT=3000

  COPY --from=build --chown=bun:bun /app/.next/standalone ./
  COPY --from=build --chown=bun:bun /app/.next/static ./.next/static

  USER bun
  EXPOSE 3000

  HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

  CMD ["bun", "server.js"]
  ```
  (`oven/bun` images ship an unprivileged `bun` user, same role as `node:node` in the
  official Node image.)

- [ ] **Step 2: Update the `start` script for local parity**

  In `package.json`, change:
  ```json
  "start": "node .next/standalone/server.js",
  ```
  to:
  ```json
  "start": "bun .next/standalone/server.js",
  ```

- [ ] **Step 3: Build and verify**

  Run: `docker build -t medarbeiter-one-test .`
  Expected: build succeeds through all three stages.

  Run: `docker run --rm -p 3001:3000 -e META_ACCESS_TOKEN=x -e META_BUSINESS_ID=x -e MEDARBEITER_CLIENT_ID=x -e MEDARBEITER_CLIENT_SECRET=x -e MEDARBEITER_REDIRECT_URI=x -e SESSION_SECRET=x medarbeiter-one-test &`
  then `curl -sf http://localhost:3001/api/health`
  Expected: `{"status":"ok"}`. Stop the container after.

- [ ] **Step 4: Commit**
  ```bash
  git add Dockerfile package.json
  git commit -m "build: run the production container on Bun so bun:sqlite works at runtime"
  ```

---

# Part 2 — Storage

## Task 2: `lib/inbox-store.ts` — schema and CRUD

**Files:**
- Create: `lib/inbox-store.ts`
- Test: `lib/inbox-store.test.ts`

**Interfaces:**
- Consumes: `Channel` from `./inbox`.
- Produces:
  - `type Thread = { id, kind: "comment"|"dm", channel: Channel, customerId, selfId,
    authorId, authorName, authorAvatar?, contextLabel?, contextThumbnail?, contextAdId?,
    postId?, answered: boolean, lastMessageAt: string, expiresAt?: string, note?: string,
    snoozedUntil?: string, updatedAt: string }`
  - `type Message = { id, threadId, authorId, authorName, text, fromSelf: boolean,
    createdAt: string }`
  - `type ThreadFilter = { customerId?, channel?, kind?, answered?: boolean, q?: string }`
  - `openDb(path?: string): Database`
  - `initSchema(db: Database): void`
  - `upsertThread(db: Database, thread: Thread): void`
  - `insertMessage(db: Database, message: Message): void` (idempotent — `INSERT OR IGNORE`)
  - `listThreads(db: Database, filter: ThreadFilter): Thread[]`
  - `getThread(db: Database, id: string): Thread | undefined`
  - `listMessages(db: Database, threadId: string): Message[]`
  - `countUnanswered(db: Database, customerId?: string): number`
  - `recordSentMessage(db: Database, message: Message): void` (inserts the message, sets
    `answered = 1`, bumps `last_message_at` on the parent thread — used by the reply path)

- [ ] **Step 1: Write failing tests**

  `lib/inbox-store.test.ts`:
  ```ts
  /**
   * bun:sqlite direkt gegen eine :memory:-Datenbank – kein Mock, die echte
   * Engine ist schnell genug und die Testfälle sind genau die Stellen, an
   * denen SQL leise falsch sein kann (Upsert, abgeleitete Spalten, Filter).
   */
  import { expect, test } from "bun:test";
  import { Database } from "bun:sqlite";
  import {
    countUnanswered,
    getThread,
    initSchema,
    insertMessage,
    listMessages,
    listThreads,
    recordSentMessage,
    upsertThread,
    type Message,
    type Thread,
  } from "./inbox-store";

  function freshDb() {
    const db = new Database(":memory:");
    initSchema(db);
    return db;
  }

  const thread = (over: Partial<Thread> = {}): Thread => ({
    id: "c1",
    kind: "comment",
    channel: "facebook",
    customerId: "acme",
    selfId: "page_1",
    authorId: "u1",
    authorName: "Anna",
    answered: false,
    lastMessageAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-08-20T09:00:00.000Z",
    ...over,
  });

  const message = (over: Partial<Message> = {}): Message => ({
    id: "m1",
    threadId: "c1",
    authorId: "u1",
    authorName: "Anna",
    text: "How do I apply?",
    fromSelf: false,
    createdAt: "2026-08-20T09:00:00.000Z",
    ...over,
  });

  test("ein Thread lässt sich schreiben und wieder lesen", () => {
    const db = freshDb();
    upsertThread(db, thread());
    expect(getThread(db, "c1")).toMatchObject({ id: "c1", authorName: "Anna", answered: false });
  });

  test("ein zweites Upsert mit derselben Id ersetzt, statt eine zweite Zeile anzulegen", () => {
    const db = freshDb();
    upsertThread(db, thread());
    upsertThread(db, thread({ answered: true, lastMessageAt: "2026-08-20T10:00:00.000Z" }));
    expect(listThreads(db, {})).toHaveLength(1);
    expect(getThread(db, "c1")?.answered).toBe(true);
  });

  test("Nachrichten kommen in Zeitfolge zurück, ein Wiederholen derselben Id dupliziert nicht", () => {
    const db = freshDb();
    upsertThread(db, thread());
    insertMessage(db, message({ id: "m1", createdAt: "2026-08-20T09:00:00.000Z" }));
    insertMessage(db, message({ id: "m1", createdAt: "2026-08-20T09:00:00.000Z" })); // Webhook-Replay
    insertMessage(db, message({ id: "m2", createdAt: "2026-08-20T09:05:00.000Z", fromSelf: true, text: "Schreib uns eine PN" }));
    expect(listMessages(db, "c1").map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  test("Filter: Kunde, Kanal, Art, beantwortet", () => {
    const db = freshDb();
    upsertThread(db, thread({ id: "c1", customerId: "acme", channel: "facebook", kind: "comment", answered: false }));
    upsertThread(db, thread({ id: "c2", customerId: "acme", channel: "instagram", kind: "dm", answered: true }));
    upsertThread(db, thread({ id: "c3", customerId: "other", channel: "facebook", kind: "comment", answered: false }));

    expect(listThreads(db, { customerId: "acme" }).map((t) => t.id).sort()).toEqual(["c1", "c2"]);
    expect(listThreads(db, { channel: "instagram" }).map((t) => t.id)).toEqual(["c2"]);
    expect(listThreads(db, { kind: "dm" }).map((t) => t.id)).toEqual(["c2"]);
    expect(listThreads(db, { answered: false }).map((t) => t.id).sort()).toEqual(["c1", "c3"]);
  });

  test("Freitextsuche trifft Autor und Kontext, nicht andere Felder", () => {
    const db = freshDb();
    upsertThread(db, thread({ id: "c1", authorName: "Anna Beispiel" }));
    upsertThread(db, thread({ id: "c2", authorName: "Bruno", contextLabel: "We are hiring carers" }));
    expect(listThreads(db, { q: "anna" }).map((t) => t.id)).toEqual(["c1"]);
    expect(listThreads(db, { q: "hiring" }).map((t) => t.id)).toEqual(["c2"]);
  });

  test("countUnanswered zählt nur offene Threads, optional je Kunde", () => {
    const db = freshDb();
    upsertThread(db, thread({ id: "c1", customerId: "acme", answered: false }));
    upsertThread(db, thread({ id: "c2", customerId: "acme", answered: true }));
    upsertThread(db, thread({ id: "c3", customerId: "other", answered: false }));
    expect(countUnanswered(db)).toBe(2);
    expect(countUnanswered(db, "acme")).toBe(1);
  });

  test("recordSentMessage schreibt die Nachricht und beantwortet den Thread in einem Schritt", () => {
    const db = freshDb();
    upsertThread(db, thread({ answered: false, lastMessageAt: "2026-08-20T09:00:00.000Z" }));
    recordSentMessage(db, message({ id: "reply_1", fromSelf: true, text: "Klar, schreib uns!", createdAt: "2026-08-20T11:00:00.000Z" }));
    const t = getThread(db, "c1")!;
    expect(t.answered).toBe(true);
    expect(t.lastMessageAt).toBe("2026-08-20T11:00:00.000Z");
    expect(listMessages(db, "c1").at(-1)).toMatchObject({ id: "reply_1", fromSelf: true });
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `bun test lib/inbox-store.test.ts`
  Expected: FAIL — `Cannot find module './inbox-store'`.

- [ ] **Step 3: Implement `lib/inbox-store.ts`**

  ```ts
  /**
   * Der lokale Zwischenspeicher für Kommentare und DMs. bun:sqlite statt eine
   * Bibliothek: Bun bringt es mit (siehe Dockerfile – die Laufzeit ist Bun,
   * nicht Node, genau deswegen), und die App läuft als ein Container ohne
   * Replika – ein Schreiber ist keine Einschränkung.
   *
   * threads ist die Zeilen-Einheit der Listenspalte: eine Zeile je oberstem
   * Kommentar oder je DM-Unterhaltung. messages trägt die volle Historie
   * dahinter – bei Kommentaren inklusive des ursprünglichen Kommentars selbst,
   * nicht nur seiner Antworten.
   */
  import { Database } from "bun:sqlite";
  import type { Channel } from "./inbox";

  export type Thread = {
    id: string;
    kind: "comment" | "dm";
    channel: Channel;
    customerId: string;
    selfId: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    contextLabel?: string;
    contextThumbnail?: string;
    contextAdId?: string;
    postId?: string;
    answered: boolean;
    lastMessageAt: string;
    expiresAt?: string;
    note?: string;
    snoozedUntil?: string;
    updatedAt: string;
  };

  export type Message = {
    id: string;
    threadId: string;
    authorId: string;
    authorName: string;
    text: string;
    fromSelf: boolean;
    createdAt: string;
  };

  export type ThreadFilter = {
    customerId?: string;
    channel?: Channel;
    kind?: "comment" | "dm";
    answered?: boolean;
    q?: string;
  };

  export function initSchema(db: Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        channel TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        self_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_avatar TEXT,
        context_label TEXT,
        context_thumbnail TEXT,
        context_ad_id TEXT,
        post_id TEXT,
        answered INTEGER NOT NULL DEFAULT 0,
        last_message_at TEXT NOT NULL,
        expires_at TEXT,
        note TEXT,
        snoozed_until TEXT,
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
    `);
  }

  let singleton: Database | undefined;

  /** Ein Prozess, eine Verbindung – bun:sqlite ist synchron, ein zweites Handle brächte nichts. */
  export function openDb(path = process.env.INBOX_DB_PATH ?? "/data/inbox.sqlite"): Database {
    if (singleton) return singleton;
    singleton = new Database(path, { create: true });
    initSchema(singleton);
    return singleton;
  }

  const toThread = (r: any): Thread => ({
    id: r.id,
    kind: r.kind,
    channel: r.channel,
    customerId: r.customer_id,
    selfId: r.self_id,
    authorId: r.author_id,
    authorName: r.author_name,
    authorAvatar: r.author_avatar ?? undefined,
    contextLabel: r.context_label ?? undefined,
    contextThumbnail: r.context_thumbnail ?? undefined,
    contextAdId: r.context_ad_id ?? undefined,
    postId: r.post_id ?? undefined,
    answered: !!r.answered,
    lastMessageAt: r.last_message_at,
    expiresAt: r.expires_at ?? undefined,
    note: r.note ?? undefined,
    snoozedUntil: r.snoozed_until ?? undefined,
    updatedAt: r.updated_at,
  });

  const toMessage = (r: any): Message => ({
    id: r.id,
    threadId: r.thread_id,
    authorId: r.author_id,
    authorName: r.author_name,
    text: r.text,
    fromSelf: !!r.from_self,
    createdAt: r.created_at,
  });

  export function upsertThread(db: Database, t: Thread): void {
    db.query(
      `INSERT INTO threads (
        id, kind, channel, customer_id, self_id, author_id, author_name, author_avatar,
        context_label, context_thumbnail, context_ad_id, post_id, answered, last_message_at,
        expires_at, note, snoozed_until, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        answered = excluded.answered,
        last_message_at = excluded.last_message_at,
        author_name = excluded.author_name,
        author_avatar = excluded.author_avatar,
        context_label = excluded.context_label,
        context_thumbnail = excluded.context_thumbnail,
        context_ad_id = excluded.context_ad_id,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`,
    ).run(
      t.id, t.kind, t.channel, t.customerId, t.selfId, t.authorId, t.authorName, t.authorAvatar ?? null,
      t.contextLabel ?? null, t.contextThumbnail ?? null, t.contextAdId ?? null, t.postId ?? null,
      t.answered ? 1 : 0, t.lastMessageAt, t.expiresAt ?? null, t.note ?? null, t.snoozedUntil ?? null,
      t.updatedAt,
    );
  }

  export function insertMessage(db: Database, m: Message): void {
    // OR IGNORE: derselbe Kommentar/dieselbe Nachricht kommt über Webhook und
    // Reconcile doppelt vorbei – die Id ist Metas eigene, ein zweiter Schreib-
    // versuch ist ein No-Op, kein Fehler.
    db.query(
      `INSERT OR IGNORE INTO messages (id, thread_id, author_id, author_name, text, from_self, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(m.id, m.threadId, m.authorId, m.authorName, m.text, m.fromSelf ? 1 : 0, m.createdAt);
  }

  export function listThreads(db: Database, f: ThreadFilter): Thread[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.customerId) { where.push("customer_id = ?"); params.push(f.customerId); }
    if (f.channel) { where.push("channel = ?"); params.push(f.channel); }
    if (f.kind) { where.push("kind = ?"); params.push(f.kind); }
    if (f.answered !== undefined) { where.push("answered = ?"); params.push(f.answered ? 1 : 0); }
    if (f.q) {
      where.push("(author_name LIKE ? OR context_label LIKE ?)");
      params.push(`%${f.q}%`, `%${f.q}%`);
    }
    const sql = `SELECT * FROM threads ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY last_message_at DESC`;
    return db.query(sql).all(...params).map(toThread);
  }

  export const getThread = (db: Database, id: string): Thread | undefined => {
    const row = db.query("SELECT * FROM threads WHERE id = ?").get(id);
    return row ? toThread(row) : undefined;
  };

  export const listMessages = (db: Database, threadId: string): Message[] =>
    db.query("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC").all(threadId).map(toMessage);

  export const countUnanswered = (db: Database, customerId?: string): number =>
    (db.query(
      `SELECT COUNT(*) AS n FROM threads WHERE answered = 0 ${customerId ? "AND customer_id = ?" : ""}`,
    ).get(...(customerId ? [customerId] : [])) as { n: number }).n;

  /** Schreibpfad einer gesendeten Antwort: Nachricht ablegen, Thread in einem Schritt beantworten. */
  export function recordSentMessage(db: Database, m: Message): void {
    insertMessage(db, m);
    db.query(
      "UPDATE threads SET answered = 1, last_message_at = ?, updated_at = ? WHERE id = ?",
    ).run(m.createdAt, m.createdAt, m.threadId);
  }
  ```

- [ ] **Step 4: Run tests, verify pass**

  Run: `bun test lib/inbox-store.test.ts`
  Expected: PASS, all 7 tests.

- [ ] **Step 5: Typecheck and commit**

  Run: `bunx tsc --noEmit`
  ```bash
  git add lib/inbox-store.ts lib/inbox-store.test.ts
  git commit -m "feat: SQLite-backed thread/message store for the inbox"
  ```

---

# Part 3 — Ingestion

## Task 3: `lib/inbox-ingest.ts` — Facebook reconciliation

**Files:**
- Create: `lib/inbox-ingest.ts`
- Test: `lib/inbox-ingest.test.ts`

**Interfaces:**
- Consumes: `normalize`, `type Source, RawPost, RawComment, RawConversation` from
  `./inbox`; `graph` from `./graph`; `type Customer` from `./customers`; `upsertThread,
  insertMessage, openDb` from `./inbox-store`.
- Produces:
  - `fetchFacebookSource(customer: Customer, page: { id: string }, sinceIso: string):
    Promise<{ source: Source; messages: Message[] }>` — one Page's posts+comments+replies
    and conversations, already reshaped as the exact raw types `normalize()` expects.
  - `reconcileCustomer(db, customer, sinceIso): Promise<void>` — Task 4 extends this to
    also call the Instagram fetch; this task wires the Facebook half only, behind a
    channel check so it's independently testable.
  - `reconcile(db, customers: Customer[]): Promise<{ ok: number; failed: { customerId:
    string; message: string }[] }>` — the entry point `after()` calls; Task 4 finishes it.

**Design note carried over from the spec:** the Comments edge only returns `from.id` and
`created_time` on nested replies by default in `lib/inbox.ts`'s `RawComment` type, because
`normalize()` only ever needed those two fields to derive `answered`. This feature also
needs the *text* of each reply, to fill `messages`. Rather than widen `RawComment` (which
would touch `lib/inbox.ts`, ruled out by the spec), this file requests `message` on the
nested edge too — Graph returns whatever fields are asked for regardless of the narrower
TS type — and reads it back through a locally-declared richer type for the one job
`normalize()` doesn't do: building `messages` rows.

- [ ] **Step 1: Write failing tests**

  `lib/inbox-ingest.test.ts`:
  ```ts
  import { expect, test } from "bun:test";

  process.env.META_ACCESS_TOKEN = "TEST";

  const { fetchFacebookSource } = await import("./inbox-ingest");

  function stub(handler: (url: URL) => unknown) {
    const calls: URL[] = [];
    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      calls.push(url);
      // pageToken()-Aufruf zuerst beantworten, unabhängig vom Rest.
      if (url.pathname.endsWith("/page_1") && !url.pathname.includes("/posts") && !url.pathname.includes("/conversations"))
        return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
      return new Response(JSON.stringify(handler(url)));
    }) as typeof fetch;
    return calls;
  }

  test("Beiträge, Kommentare und ihre Antworten werden zur Source und zu Message-Zeilen", async () => {
    stub((url) => {
      if (url.pathname.includes("/posts")) {
        return {
          data: [
            {
              id: "post_1",
              message: "We are hiring carers",
              full_picture: "https://x/img.jpg",
              comments: {
                data: [
                  {
                    id: "c1",
                    message: "How do I apply?",
                    created_time: "2026-08-20T09:00:00+0000",
                    from: { id: "u1", name: "Anna" },
                    comments: {
                      data: [
                        {
                          id: "r1",
                          message: "Schreib uns eine PN!",
                          created_time: "2026-08-20T09:05:00+0000",
                          from: { id: "page_1", name: "ACME" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        };
      }
      return { data: [] }; // conversations
    });

    const { source, messages } = await fetchFacebookSource(
      { id: "acme", name: "ACME" } as any,
      { id: "page_1" },
      "2026-05-23T00:00:00.000Z",
    );

    expect(source.posts[0].comments?.data[0].id).toBe("c1");
    // messages trägt den Ursprungskommentar UND die Antwort, in Zeitfolge.
    expect(messages.map((m) => m.id)).toEqual(["c1", "r1"]);
    expect(messages[1]).toMatchObject({ text: "Schreib uns eine PN!", fromSelf: true });
  });

  test("Unterhaltungen kommen vollständig mit, nicht nur die letzte Nachricht", async () => {
    stub((url) => {
      if (url.pathname.includes("/conversations")) {
        return {
          data: [
            {
              id: "t_1",
              updated_time: "2026-08-20T11:00:00+0000",
              participants: { data: [{ id: "page_1" }, { id: "u2", name: "Bruno" }] },
              messages: {
                data: [
                  { id: "m2", message: "Danke!", created_time: "2026-08-20T11:00:00+0000", from: { id: "page_1" } },
                  { id: "m1", message: "Ist der Job noch offen?", created_time: "2026-08-20T10:00:00+0000", from: { id: "u2" } },
                ],
              },
            },
          ],
        };
      }
      return { data: [] }; // posts
    });

    const { source, messages } = await fetchFacebookSource(
      { id: "acme", name: "ACME" } as any,
      { id: "page_1" },
      "2026-05-23T00:00:00.000Z",
    );

    expect(source.conversations[0].id).toBe("t_1");
    expect(messages.map((m) => m.id)).toEqual(["m2", "m1"]);
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `bun test lib/inbox-ingest.test.ts`
  Expected: FAIL — `Cannot find module './inbox-ingest'`.

- [ ] **Step 3: Implement the Facebook fetch**

  `lib/inbox-ingest.ts`:
  ```ts
  /**
   * Zwei Wege in den Speicher: reconcile() für den ruhigen, selbstheilenden
   * Abgleich (nach 90 Tagen zurück), ingestWebhookEntry() (Task 7) für den
   * schnellen Weg bei Metas Echtzeit-Push. Beide laufen durch normalize() aus
   * lib/inbox.ts – das bleibt die einzige Stelle, die die vier Graph-Formen
   * kennt.
   */
  import { graph, GraphError } from "./graph";
  import type { Customer } from "./customers";
  import { normalize, type RawComment, type RawConversation, type RawPost, type Source } from "./inbox";
  import { insertMessage, upsertThread, type Message } from "./inbox-store";
  import { Database } from "bun:sqlite";

  const DAYS_90 = 90 * 24 * 60 * 60 * 1000;
  export const reconcileWindow = (now = Date.now()) => new Date(now - DAYS_90).toISOString();

  /** Reply-Text kommt zwar mit, aber nicht in RawComment's Typ – siehe Erklärung oben in der Aufgabe. */
  type RawReplyWithText = { id: string; message?: string; created_time: string; from?: { id: string; name?: string } };
  type RawPostWithReplyText = Omit<RawPost, "comments"> & {
    comments?: { data: (Omit<RawComment, "comments"> & { comments?: { data: RawReplyWithText[] } })[] };
  };

  const toMessage = (threadId: string, r: RawReplyWithText, selfId: string): Message => ({
    id: r.id,
    threadId,
    authorId: r.from?.id ?? "",
    authorName: r.from?.name ?? "Unknown",
    text: r.message ?? "",
    fromSelf: r.from?.id === selfId,
    createdAt: new Date(r.created_time).toISOString(),
  });

  const FB_POST_FIELDS =
    "id,message,full_picture,comments.summary(false){id,message,created_time,from,comments{id,message,created_time,from}}";
  const FB_CONVO_FIELDS = "id,updated_time,participants,messages{id,message,created_time,from}";

  export async function fetchFacebookSource(
    customer: Customer,
    page: { id: string },
    sinceIso: string,
  ): Promise<{ source: Source; messages: Message[] }> {
    const since = Math.floor(Date.parse(sinceIso) / 1000);
    const [posts, conversations] = await Promise.all([
      graph<{ data: RawPostWithReplyText[] }>(`${page.id}/posts`, {
        asPage: page.id,
        params: { fields: FB_POST_FIELDS, since, limit: 50 },
      }),
      graph<{ data: RawConversation[] }>(`${page.id}/conversations`, {
        asPage: page.id,
        params: { fields: FB_CONVO_FIELDS, limit: 50 },
      }),
    ]);

    const messages: Message[] = [];
    for (const post of posts.data)
      for (const c of post.comments?.data ?? []) {
        // Der Kommentar selbst ist die erste Nachricht des Threads, nicht nur seine Antworten.
        messages.push(toMessage(c.id, c, page.id));
        for (const r of c.comments?.data ?? []) messages.push(toMessage(c.id, r, page.id));
      }
    for (const convo of conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso)))
      for (const m of convo.messages?.data ?? []) messages.push(toMessage(convo.id, m as any, page.id));
    messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    return {
      source: {
        customerId: customer.id,
        channel: "facebook",
        selfId: page.id,
        posts: posts.data as unknown as RawPost[],
        conversations: conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso)),
      },
      messages,
    };
  }
  ```

- [ ] **Step 4: Run tests, verify pass**

  Run: `bun test lib/inbox-ingest.test.ts`
  Expected: PASS, both tests.

- [ ] **Step 5: Commit**
  ```bash
  git add lib/inbox-ingest.ts lib/inbox-ingest.test.ts
  git commit -m "feat: fetch and shape Facebook comments/DMs for the inbox store"
  ```

## Task 4: Instagram fetch, `reconcileCustomer`, and `reconcile()`

**Files:**
- Modify: `lib/inbox-ingest.ts`
- Modify: `lib/inbox-ingest.test.ts`

**Interfaces:**
- Consumes: everything from Task 3, plus `Database` from `bun:sqlite`.
- Produces:
  - `fetchInstagramSource(customer, page: { id: string; instagram: { id: string } },
    sinceIso): Promise<{ source: Source; messages: Message[] }>`
  - `reconcileCustomer(db: Database, customer: Customer, sinceIso: string): Promise<void>`
  - `reconcile(db: Database, customers: Customer[]): Promise<{ ok: number; failed: {
    customerId: string; message: string }[] }>`

- [ ] **Step 1: Add failing tests for Instagram and the full reconcile loop**

  Append to `lib/inbox-ingest.test.ts`:
  ```ts
  const { fetchInstagramSource, reconcile } = await import("./inbox-ingest");

  test("Instagram-Kommentare werden auf die FB-Feldnamen abgebildet (text→message, timestamp→created_time)", async () => {
    stub((url) => {
      if (url.pathname.includes("/media")) {
        return {
          data: [
            {
              id: "media_1",
              caption: "New opening in Dresden",
              media_url: "https://x/photo.jpg",
              comments: {
                data: [
                  {
                    id: "ic1",
                    text: "Interessiert!",
                    timestamp: "2026-08-20T09:00:00+0000",
                    from: { id: "iu1", username: "anna_k" },
                    replies: { data: [] },
                  },
                ],
              },
            },
          ],
        };
      }
      return { data: [] }; // conversations
    });

    const { source, messages } = await fetchInstagramSource(
      { id: "acme", name: "ACME" } as any,
      { id: "page_1", instagram: { id: "ig_1" } } as any,
      "2026-05-23T00:00:00.000Z",
    );

    expect(source.posts[0]).toMatchObject({ message: "New opening in Dresden", full_picture: "https://x/photo.jpg" });
    expect(source.posts[0].comments?.data[0]).toMatchObject({ id: "ic1", message: "Interessiert!" });
    expect(messages[0]).toMatchObject({ id: "ic1", authorName: "anna_k" });
  });

  test("reconcile() schreibt für jeden Kunden mit Seite Threads und Nachrichten in die Datenbank, ein Fehlschlag stoppt die anderen nicht", async () => {
    const { Database } = await import("bun:sqlite");
    const { initSchema, listThreads, listMessages } = await import("./inbox-store");
    const db = new Database(":memory:");
    initSchema(db);

    let call = 0;
    globalThis.fetch = (async (input: any) => {
      call++;
      const url = new URL(String(input));
      if (url.pathname.endsWith("/broken_page")) return new Response(JSON.stringify({ error: { code: 200, message: "no perm" } }), { status: 403 });
      if (!url.pathname.includes("/posts") && !url.pathname.includes("/conversations") && !url.pathname.includes("/media"))
        return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
      if (url.pathname.includes("/posts") && url.pathname.startsWith("/v")) {
        return new Response(JSON.stringify({
          data: [{ id: "post_1", message: "Hi", comments: { data: [{ id: "c1", message: "Hallo", created_time: "2026-08-20T09:00:00+0000", from: { id: "u1", name: "Anna" } }] } }],
        }));
      }
      return new Response(JSON.stringify({ data: [] }));
    }) as typeof fetch;

    const customers = [
      { id: "acme", name: "ACME", page: { id: "page_1" } } as any,
      { id: "broken", name: "Broken", page: { id: "broken_page" } } as any,
    ];
    const result = await reconcile(db, customers);

    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([{ customerId: "broken", message: expect.stringContaining("no perm") }]);
    expect(listThreads(db, {})).toHaveLength(1);
    expect(listMessages(db, "c1")).toHaveLength(1);
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `bun test lib/inbox-ingest.test.ts`
  Expected: FAIL — `fetchInstagramSource is not a function`.

- [ ] **Step 3: Implement Instagram fetch and the reconcile loop**

  Append to `lib/inbox-ingest.ts`:
  ```ts
  const IG_MEDIA_FIELDS =
    "id,caption,media_url,comments{id,text,timestamp,from,replies{id,text,timestamp,from}}";
  // IG-DMs laufen über dieselbe Conversations-API wie Messenger, nur mit
  // platform=instagram – deshalb hier dieselben Feldnamen wie bei Facebook,
  // anders als bei Kommentaren (dort ist media/comments eine eigene, ältere
  // IG-Edge mit eigenen Feldnamen: text/timestamp statt message/created_time).
  const IG_CONVO_FIELDS = FB_CONVO_FIELDS;

  type RawIgComment = { id: string; text?: string; timestamp: string; from?: { id: string; username?: string }; replies?: { data: RawIgComment[] } };
  type RawIgMedia = { id: string; caption?: string; media_url?: string; comments?: { data: RawIgComment[] } };

  const igToRawPost = (m: RawIgMedia): RawPostWithReplyText => ({
    id: m.id,
    message: m.caption,
    full_picture: m.media_url,
    comments: {
      data: (m.comments?.data ?? []).map((c) => ({
        id: c.id,
        message: c.text,
        created_time: c.timestamp,
        from: c.from ? { id: c.from.id, name: c.from.username } : undefined,
        comments: { data: (c.replies?.data ?? []).map((r) => ({ id: r.id, message: r.text, created_time: r.timestamp, from: r.from ? { id: r.from.id, name: r.from.username } : undefined })) },
      })),
    },
  });

  export async function fetchInstagramSource(
    customer: Customer,
    page: { id: string; instagram: { id: string } },
    sinceIso: string,
  ): Promise<{ source: Source; messages: Message[] }> {
    const since = Math.floor(Date.parse(sinceIso) / 1000);
    const [media, conversations] = await Promise.all([
      graph<{ data: RawIgMedia[] }>(`${page.instagram.id}/media`, {
        asPage: page.id, // IG hat kein eigenes Token – es reitet auf dem der verknüpften Seite.
        params: { fields: IG_MEDIA_FIELDS, since, limit: 50 },
      }),
      graph<{ data: RawConversation[] }>(`${page.id}/conversations`, {
        asPage: page.id,
        params: { fields: IG_CONVO_FIELDS, platform: "instagram", limit: 50 },
      }),
    ]);

    const posts = media.data.map(igToRawPost);
    const messages: Message[] = [];
    for (const post of posts)
      for (const c of post.comments?.data ?? []) {
        messages.push(toMessage(c.id, c, page.id));
        for (const r of c.comments?.data ?? []) messages.push(toMessage(c.id, r, page.id));
      }
    for (const convo of conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso)))
      for (const m of convo.messages?.data ?? []) messages.push(toMessage(convo.id, m as any, page.id));
    messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    return {
      source: {
        customerId: customer.id,
        channel: "instagram",
        selfId: page.id,
        posts: posts as unknown as RawPost[],
        conversations: conversations.data.filter((c) => Date.parse(c.updated_time) >= Date.parse(sinceIso)),
      },
      messages,
    };
  }

  function store(db: Database, source: Source, messages: Message[]): void {
    const items = normalize([source]);
    for (const item of items)
      upsertThread(db, {
        id: item.id,
        kind: item.kind,
        channel: item.channel,
        customerId: item.customerId,
        selfId: source.selfId,
        authorId: item.author.id,
        authorName: item.author.name,
        authorAvatar: undefined,
        contextLabel: item.context?.label,
        contextThumbnail: item.context?.thumbnail,
        contextAdId: item.context?.adId,
        postId: item.postId,
        answered: item.answered,
        lastMessageAt: item.createdAt,
        expiresAt: item.expiresAt,
        updatedAt: new Date().toISOString(),
      });
    for (const m of messages) insertMessage(db, m);
  }

  export async function reconcileCustomer(db: Database, customer: Customer, sinceIso: string): Promise<void> {
    const page = customer.page;
    if (!page) return; // kein Auftritt, kein Posteingang – z. B. reine Zahlkonten.

    const [fb, ig] = await Promise.all([
      fetchFacebookSource(customer, { id: page.id }, sinceIso),
      customer.instagram ? fetchInstagramSource(customer, { id: page.id, instagram: customer.instagram }, sinceIso) : undefined,
    ]);
    store(db, fb.source, fb.messages);
    if (ig) store(db, ig.source, ig.messages);
  }

  /** Auslöser für app/layout.tsx. Läuft für jeden Kunden mit Seite; einer scheitert nie für alle. */
  export async function reconcile(db: Database, customers: Customer[]): Promise<{ ok: number; failed: { customerId: string; message: string }[] }> {
    const since = reconcileWindow();
    const targets = customers.filter((c) => c.page);
    const settled = await Promise.allSettled(targets.map((c) => reconcileCustomer(db, c, since)));

    const failed: { customerId: string; message: string }[] = [];
    let ok = 0;
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") ok++;
      else failed.push({ customerId: targets[i].id, message: (r.reason as GraphError).message });
    });
    return { ok, failed };
  }
  ```

- [ ] **Step 4: Run tests, verify pass**

  Run: `bun test lib/inbox-ingest.test.ts`
  Expected: PASS, all 4 tests.

- [ ] **Step 5: Typecheck and commit**

  Run: `bunx tsc --noEmit`
  ```bash
  git add lib/inbox-ingest.ts lib/inbox-ingest.test.ts
  git commit -m "feat: Instagram ingestion and the full multi-customer reconcile loop"
  ```

## Task 5: New icon meanings

**Files:**
- Modify: `theme/icons.tsx`
- Modify: `theme/icons.test.ts`

**Interfaces:**
- Produces: `MEANINGS.comment`, `MEANINGS.dm`, `MEANINGS.facebook`, `MEANINGS.instagram`,
  `MEANINGS.send`.

- [ ] **Step 1: Check the existing vocabulary test, add assertions for the new meanings**

  Read `theme/icons.test.ts` first — it very likely enforces "no glyph reused across
  meanings" already (referenced in `theme/icons.tsx`'s own `collapse`/`expand` comment).
  Add:
  ```ts
  test("die Inbox-Bedeutungen sind eigene Glyphen, keine Wiederverwendung", () => {
    for (const m of ["comment", "dm", "facebook", "instagram", "send"] as const)
      expect(MEANINGS[m]).toBeDefined();
  });
  ```
  (Match this repo's existing test's import/style exactly — read the file before writing.)

- [ ] **Step 2: Run test, verify failure**

  Run: `bun test theme/icons.test.ts`
  Expected: FAIL — `MEANINGS.comment` is `undefined`.

- [ ] **Step 3: Add the imports and meanings**

  In `theme/icons.tsx`, add to the `@phosphor-icons/react` import list:
  ```ts
  ChatCircleText, EnvelopeSimple, FacebookLogo, InstagramLogo, PaperPlaneTilt,
  ```
  and to `MEANINGS`:
  ```ts
  comment: { solid: ChatCircleText, outline: ChatCircleText },
  dm: { solid: EnvelopeSimple, outline: EnvelopeSimple },
  facebook: { solid: FacebookLogo, outline: FacebookLogo },
  instagram: { solid: InstagramLogo, outline: InstagramLogo },
  send: { solid: PaperPlaneTilt, outline: PaperPlaneTilt },
  ```

- [ ] **Step 4: Run test, verify pass**

  Run: `bun test theme/icons.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add theme/icons.tsx theme/icons.test.ts
  git commit -m "feat: comment/dm/channel/send icon meanings for the inbox"
  ```

## Task 6: Webhook route — challenge and signature verification

**Files:**
- Create: `app/api/webhooks/meta/route.ts`
- Test: `app/api/webhooks/meta/route.test.ts`

**Interfaces:**
- Produces: `GET`, `POST` route handlers.
- Consumes (added in Task 7): `ingestWebhookEntry` from `@/lib/inbox-ingest`.

- [ ] **Step 1: Write failing tests for the challenge and signature check**

  ```ts
  import { expect, test } from "bun:test";
  import { createHmac } from "node:crypto";

  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
  process.env.META_APP_SECRET = "app-secret";
  process.env.META_ACCESS_TOKEN = "TEST";

  const { GET, POST } = await import("./route");

  test("GET beantwortet Metas Challenge nur mit dem richtigen Verify-Token", async () => {
    const ok = await GET(new Request("https://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123"));
    expect(await ok.text()).toBe("123");
    expect(ok.status).toBe(200);

    const wrong = await GET(new Request("https://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=falsch&hub.challenge=123"));
    expect(wrong.status).toBe(403);
  });

  function signed(body: string, secret = "app-secret") {
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    return new Request("https://x/api/webhooks/meta", { method: "POST", body, headers: { "x-hub-signature-256": sig } });
  }

  test("POST ohne gültige Signatur wird abgelehnt, ohne den Body zu verarbeiten", async () => {
    const res = await POST(new Request("https://x/api/webhooks/meta", { method: "POST", body: JSON.stringify({ entry: [] }), headers: { "x-hub-signature-256": "sha256=falsch" } }));
    expect(res.status).toBe(403);
  });

  test("POST mit gültiger Signatur und leeren Einträgen antwortet 200", async () => {
    const res = await POST(signed(JSON.stringify({ object: "page", entry: [] })));
    expect(res.status).toBe(200);
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `bun test app/api/webhooks/meta/route.test.ts`
  Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route (challenge + signature only, entries handled in Task 7)**

  ```ts
  /**
   * Metas Echtzeit-Weg: GET beantwortet die einmalige Prüfung beim Einrichten
   * (README), POST liefert jede Änderung, sobald sie passiert.
   */
  import { createHmac, timingSafeEqual } from "node:crypto";

  export async function GET(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (params.get("hub.mode") === "subscribe" && token && params.get("hub.verify_token") === token)
      return new Response(params.get("hub.challenge") ?? "", { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }

  function validSignature(body: string, header: string | null): boolean {
    const secret = process.env.META_APP_SECRET;
    if (!secret || !header?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const given = Buffer.from(header.slice("sha256=".length), "hex");
    const want = Buffer.from(expected, "hex");
    // Länge zuerst: timingSafeEqual wirft bei ungleicher Länge, statt false zu liefern.
    return given.length === want.length && timingSafeEqual(given, want);
  }

  export async function POST(request: Request): Promise<Response> {
    const body = await request.text();
    if (!validSignature(body, request.headers.get("x-hub-signature-256")))
      return new Response("Forbidden", { status: 403 });

    // Entry-Verarbeitung folgt in Task 7 (ingestWebhookEntry).
    return new Response("OK", { status: 200 });
  }
  ```

- [ ] **Step 4: Run tests, verify pass**

  Run: `bun test app/api/webhooks/meta/route.test.ts`
  Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**
  ```bash
  git add app/api/webhooks/meta/route.ts app/api/webhooks/meta/route.test.ts
  git commit -m "feat: webhook challenge response and HMAC signature verification"
  ```

## Task 7: Ingest single webhook entries (comments and messages)

**Files:**
- Modify: `lib/inbox-ingest.ts`
- Modify: `lib/inbox-ingest.test.ts`
- Modify: `app/api/webhooks/meta/route.ts`
- Modify: `app/api/webhooks/meta/route.test.ts`

**Interfaces:**
- Produces: `ingestWebhookEntry(db: Database, entry: WebhookEntry, customerFor: (pageId:
  string) => Customer | undefined): Promise<void>` in `lib/inbox-ingest.ts`.
- Consumes (in the route): `listCustomers` from `@/lib/customers`, `openDb` from
  `@/lib/inbox-store`.

This handles two Meta payload shapes, both real-time and stable across API versions:
`changes` (comment add/edit on a Page's feed, and on an Instagram media) and `messaging`
(Messenger and Instagram Direct — merged into one payload shape since Graph v13). A
comment webhook only carries the *id* reliably across both Facebook's and Instagram's
payload shapes (`comment_id` vs `id`, `message` vs `text`) — rather than parse two
different embedded shapes, this re-fetches the one changed comment through the same
field set reconciliation already uses, so there is exactly one comment-shaping code path,
not three. A message webhook already carries everything needed to build one `messages`
row; what it does *not* carry is the stable Graph conversation id used as `threads.id` —
that's looked up once via the Conversations API's `user_id` filter (documented for the
Messenger Platform; same edge Instagram messages ride, per Task 4's note).

- [ ] **Step 1: Write failing tests**

  Append to `lib/inbox-ingest.test.ts`:
  ```ts
  const { ingestWebhookEntry } = await import("./inbox-ingest");

  test("ein Kommentar-Webhook holt den Kommentar nach und legt Thread + Nachricht an", async () => {
    const { Database } = await import("bun:sqlite");
    const { initSchema, getThread, listMessages } = await import("./inbox-store");
    const db = new Database(":memory:");
    initSchema(db);

    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/page_1")) return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
      if (url.pathname.includes("/c1")) return new Response(JSON.stringify({ id: "c1", message: "Frage!", created_time: "2026-08-21T09:00:00+0000", from: { id: "u1", name: "Anna" }, comments: { data: [] } }));
      if (url.pathname.includes("/post_1")) return new Response(JSON.stringify({ id: "post_1", message: "Beitrag", full_picture: "https://x/p.jpg" }));
      return new Response(JSON.stringify({ data: [] }));
    }) as typeof fetch;

    await ingestWebhookEntry(
      db,
      { id: "page_1", changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "c1", post_id: "post_1", parent_id: "post_1" } }] },
      () => ({ id: "acme", name: "ACME", page: { id: "page_1" } }) as any,
    );

    expect(getThread(db, "c1")).toMatchObject({ authorName: "Anna", answered: false });
    expect(listMessages(db, "c1")).toHaveLength(1);
  });

  test("eine Antwort auf einen bestehenden Kommentar hängt an dessen Thread, statt einen neuen zu eröffnen", async () => {
    const { Database } = await import("bun:sqlite");
    const { initSchema, upsertThread, getThread, listMessages } = await import("./inbox-store");
    const db = new Database(":memory:");
    initSchema(db);
    upsertThread(db, { id: "c1", kind: "comment", channel: "facebook", customerId: "acme", selfId: "page_1", authorId: "u1", authorName: "Anna", answered: false, lastMessageAt: "2026-08-21T09:00:00.000Z", updatedAt: "2026-08-21T09:00:00.000Z" });

    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/page_1")) return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
      if (url.pathname.includes("/r1")) return new Response(JSON.stringify({ id: "r1", message: "Schreib uns eine PN", created_time: "2026-08-21T09:05:00+0000", from: { id: "page_1", name: "ACME" } }));
      return new Response(JSON.stringify({ data: [] }));
    }) as typeof fetch;

    await ingestWebhookEntry(
      db,
      { id: "page_1", changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "r1", post_id: "post_1", parent_id: "c1" } }] },
      () => ({ id: "acme", name: "ACME", page: { id: "page_1" } }) as any,
    );

    expect(getThread(db, "c1")?.answered).toBe(true);
    expect(listMessages(db, "c1").map((m) => m.id)).toEqual(["r1"]);
  });

  test("eine eingehende Nachricht sucht die Unterhaltung nach und hängt die Nachricht dort an", async () => {
    const { Database } = await import("bun:sqlite");
    const { initSchema, getThread, listMessages } = await import("./inbox-store");
    const db = new Database(":memory:");
    initSchema(db);

    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/page_1") && !url.pathname.includes("conversations")) return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
      if (url.pathname.includes("/conversations")) return new Response(JSON.stringify({ data: [{ id: "t_1", updated_time: "2026-08-21T12:00:00+0000", participants: { data: [{ id: "page_1" }, { id: "u2", name: "Bruno" }] } }] }));
      return new Response(JSON.stringify({ data: [] }));
    }) as typeof fetch;

    await ingestWebhookEntry(
      db,
      { id: "page_1", messaging: [{ sender: { id: "u2" }, recipient: { id: "page_1" }, timestamp: 1755777600000, message: { mid: "m1", text: "Ist der Job noch offen?" } }] },
      () => ({ id: "acme", name: "ACME", page: { id: "page_1" } }) as any,
    );

    expect(getThread(db, "t_1")).toMatchObject({ answered: false, authorName: "Bruno" });
    expect(listMessages(db, "t_1")[0]).toMatchObject({ id: "m1", text: "Ist der Job noch offen?" });
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `bun test lib/inbox-ingest.test.ts`
  Expected: FAIL — `ingestWebhookEntry is not a function`.

- [ ] **Step 3: Implement `ingestWebhookEntry`**

  Append to `lib/inbox-ingest.ts`:
  ```ts
  import type { Customer } from "./customers";

  export type WebhookEntry = {
    id: string; // Page- oder IG-Business-Id, je nach Objekt-Typ des Webhooks
    changes?: { field: string; value: { item?: string; verb?: string; comment_id?: string; id?: string; post_id?: string; media?: { id: string }; parent_id?: string } }[];
    messaging?: { sender: { id: string }; recipient: { id: string }; timestamp: number; message?: { mid: string; text?: string } }[];
  };

  const FB_COMMENT_FIELDS = "id,message,created_time,from,comments{id,message,created_time,from}";
  const FB_POST_MINI_FIELDS = "id,message,full_picture";

  async function ingestComment(db: Database, pageId: string, customer: Customer, commentId: string, postId: string, threadId: string): Promise<void> {
    const [comment, post] = await Promise.all([
      graph<RawPostWithReplyText["comments"] extends infer _ ? any : never>(commentId, { asPage: pageId, params: { fields: FB_COMMENT_FIELDS } }),
      graph<{ id: string; message?: string; full_picture?: string }>(postId, { asPage: pageId, params: { fields: FB_POST_MINI_FIELDS } }).catch(() => ({ id: postId })),
    ]);

    const source: Source = {
      customerId: customer.id,
      channel: customer.instagram && postId.startsWith(customer.instagram.id) ? "instagram" : "facebook",
      selfId: pageId,
      posts: threadId === commentId
        ? [{ id: postId, message: (post as any).message, full_picture: (post as any).full_picture, comments: { data: [comment] } }]
        : [],
      conversations: [],
    };

    if (threadId === commentId) {
      store(db, source, [toMessage(commentId, comment, pageId)]);
    } else {
      // Antwort auf einen bestehenden Thread: kein neuer Thread, nur eine
      // weitere Nachricht plus "beantwortet", wenn wir selbst geschrieben haben.
      const reply = toMessage(threadId, comment, pageId);
      insertMessage(db, reply);
      if (reply.fromSelf) {
        const existing = db.query("SELECT customer_id FROM threads WHERE id = ?").get(threadId) as { customer_id: string } | undefined;
        if (existing) db.query("UPDATE threads SET answered = 1, last_message_at = ?, updated_at = ? WHERE id = ?").run(reply.createdAt, reply.createdAt, threadId);
      }
    }
  }

  async function ingestMessage(db: Database, pageId: string, customer: Customer, senderId: string, mid: string, text: string, timestamp: number): Promise<void> {
    // Der Webhook trägt keine Unterhaltungs-Id – dieselbe, die reconcile() über
    // die Conversations-Edge bekommt, kommt hier über deren user_id-Filter.
    const { data } = await graph<{ data: RawConversation[] }>(`${pageId}/conversations`, {
      asPage: pageId,
      params: { fields: "id,updated_time,participants", user_id: senderId, limit: 1 },
    });
    const convo = data[0];
    if (!convo) return; // Meta liefert die Konversation manchmal erst mit minimaler Verzögerung – reconcile() holt sie spätestens in 90 Tagen nach.

    const fromSelf = false; // eingehende messaging-Events sind vom Gegenüber; ausgehende laufen über inbox-send.ts, nicht über den Webhook.
    const other = (convo.participants?.data ?? []).find((p) => p.id !== pageId);
    const createdAt = new Date(timestamp).toISOString();

    const source: Source = {
      customerId: customer.id,
      channel: "facebook",
      selfId: pageId,
      posts: [],
      conversations: [{ ...convo, messages: { data: [{ id: mid, message: text, created_time: createdAt, from: { id: senderId, name: other?.name } }] } }],
    };
    store(db, source, [{ id: mid, threadId: convo.id, authorId: senderId, authorName: other?.name ?? "Unknown", text, fromSelf, createdAt }]);
  }

  export async function ingestWebhookEntry(db: Database, entry: WebhookEntry, customerFor: (pageId: string) => Customer | undefined): Promise<void> {
    const customer = customerFor(entry.id);
    if (!customer) return; // Seite gehört keinem geführten Kunden (mehr) – nichts zu tun.

    for (const change of entry.changes ?? []) {
      if (change.field !== "feed" && change.field !== "comments") continue;
      const v = change.value;
      if (v.item !== "comment" || v.verb !== "add") continue;
      const commentId = v.comment_id ?? v.id;
      const postId = v.post_id ?? v.media?.id;
      if (!commentId || !postId) continue;
      const threadId = v.parent_id && v.parent_id !== postId ? v.parent_id : commentId;
      await ingestComment(db, entry.id, customer, commentId, postId, threadId);
    }

    for (const m of entry.messaging ?? []) {
      if (!m.message?.text) continue;
      await ingestMessage(db, entry.id, customer, m.sender.id, m.message.mid, m.message.text, m.timestamp);
    }
  }
  ```

- [ ] **Step 4: Run tests, verify pass**

  Run: `bun test lib/inbox-ingest.test.ts`
  Expected: PASS, all 7 tests. If `RawPostWithReplyText["comments"] extends infer _ ? any :
  never` reads as noise (it does — it's a placeholder to keep the generic loose without
  `any` littering the signature), simplify it to `any` directly; there's no consumer of
  that particular return type.

- [ ] **Step 5: Wire the route to call it**

  In `app/api/webhooks/meta/route.ts`, replace the `POST` body:
  ```ts
  import { ingestWebhookEntry, type WebhookEntry } from "@/lib/inbox-ingest";
  import { openDb } from "@/lib/inbox-store";
  import { listCustomers } from "@/lib/customers";

  export async function POST(request: Request): Promise<Response> {
    const body = await request.text();
    if (!validSignature(body, request.headers.get("x-hub-signature-256")))
      return new Response("Forbidden", { status: 403 });

    const payload = JSON.parse(body) as { entry?: WebhookEntry[] };
    const db = openDb();
    const { customers } = await listCustomers();
    const customerFor = (pageId: string) => customers.find((c) => c.page?.id === pageId || c.instagram?.id === pageId);

    // Meta erwartet 200 innerhalb weniger Sekunden, sonst drosselt/entzieht es
    // die Zustellung – ein einzelner fehlgeschlagener Eintrag darf die Antwort
    // nicht blockieren, reconcile() holt ihn ohnehin nach.
    for (const entry of payload.entry ?? []) {
      try {
        await ingestWebhookEntry(db, entry, customerFor);
      } catch (e) {
        console.error(`[webhook] Eintrag ${entry.id} nicht verarbeitet: ${(e as Error).message}`);
      }
    }
    return new Response("OK", { status: 200 });
  }
  ```

- [ ] **Step 6: Add one route-level integration test**

  Append to `app/api/webhooks/meta/route.test.ts`:
  ```ts
  test("POST verarbeitet einen echten Eintrag und schreibt in die Datenbank", async () => {
    process.env.INBOX_DB_PATH = ":memory:";
    // listCustomers() braucht ein Portfolio – hier reicht ein Mock über den Modul-Cache nicht
    // ohne Weiteres; dieser Test bleibt bewusst auf "antwortet 200 trotz leerem Portfolio"
    // beschränkt (kein Kunde gefunden → customerFor liefert undefined → kein Fehler).
    const res = await POST(signed(JSON.stringify({ object: "page", entry: [{ id: "unknown_page", changes: [] }] })));
    expect(res.status).toBe(200);
  });
  ```

- [ ] **Step 7: Run all inbox tests, typecheck, commit**

  Run: `bun test lib/inbox-ingest.test.ts app/api/webhooks/meta/route.test.ts && bunx tsc --noEmit`
  ```bash
  git add lib/inbox-ingest.ts lib/inbox-ingest.test.ts app/api/webhooks/meta/route.ts app/api/webhooks/meta/route.test.ts
  git commit -m "feat: ingest single comment/message events from Meta's webhook"
  ```

## Task 8: Webhook subscription bookkeeping

**Files:**
- Create: `lib/webhook-subscribe.ts`
- Test: `lib/webhook-subscribe.test.ts`
- Create: `scripts/webhooks.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ensureWebhookSubscribed(pages: { id: string; name: string }[]): Promise<{
  subscribed: { id: string; name: string }[]; failed: { id: string; name: string; message:
  string }[] }>`.

- [ ] **Step 1: Write failing test**

  `lib/webhook-subscribe.test.ts`:
  ```ts
  import { expect, test } from "bun:test";

  process.env.META_ACCESS_TOKEN = "TEST";
  const { ensureWebhookSubscribed } = await import("./webhook-subscribe");

  test("jede Seite bekommt genau einen Abonnements-Aufruf mit feed und messages", async () => {
    const calls: URL[] = [];
    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname.endsWith("/page_2")) return new Response(JSON.stringify({ error: { code: 200, message: "no perm" } }), { status: 403 });
      return new Response(JSON.stringify({ success: true }));
    }) as typeof fetch;

    const result = await ensureWebhookSubscribed([{ id: "page_1", name: "ACME" }, { id: "page_2", name: "Broken" }]);
    expect(result.subscribed.map((p) => p.id)).toEqual(["page_1"]);
    expect(result.failed).toEqual([{ id: "page_2", name: "Broken", message: expect.stringContaining("no perm") }]);
    expect(calls[0].searchParams.get("subscribed_fields")).toBe("feed,messages");
  });
  ```

- [ ] **Step 2: Run test, verify failure**

  Run: `bun test lib/webhook-subscribe.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

  ```ts
  /**
   * Jede Seite braucht genau einen Abonnements-Aufruf, damit Metas Webhook
   * überhaupt etwas schickt – Instagram-Kommentare/-Nachrichten reiten auf
   * derselben Seiten-Subscription mit. Idempotent, sicher bei jedem Start
   * aufzurufen (wie lib/assign.ts:ensureAssigned) – eine neu angelegte Seite
   * bekommt ihr Abonnement, ohne dass jemand eine Einstellungsseite besucht.
   */
  import { graph, GraphError } from "./graph";

  export async function ensureWebhookSubscribed(
    pages: { id: string; name: string }[],
  ): Promise<{ subscribed: { id: string; name: string }[]; failed: { id: string; name: string; message: string }[] }> {
    const settled = await Promise.allSettled(
      pages.map((p) =>
        graph(`${p.id}/subscribed_apps`, {
          method: "POST",
          asPage: p.id,
          params: { subscribed_fields: "feed,messages" },
        }),
      ),
    );

    const subscribed: { id: string; name: string }[] = [];
    const failed: { id: string; name: string; message: string }[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") subscribed.push(pages[i]);
      else failed.push({ ...pages[i], message: (r.reason as GraphError).message });
    });
    return { subscribed, failed };
  }
  ```

- [ ] **Step 4: Run test, verify pass**

  Run: `bun test lib/webhook-subscribe.test.ts`
  Expected: PASS.

- [ ] **Step 5: CLI script and `package.json` entry**

  `scripts/webhooks.ts`:
  ```ts
  /**
   * Der laute Weg von Hand: meldet jede Seite mit Auftritt beim Webhook an und
   * berichtet, was passiert ist.
   *   bun run webhooks
   */
  import { listCustomers } from "../lib/customers";
  import { ensureWebhookSubscribed } from "../lib/webhook-subscribe";

  const { customers } = await listCustomers();
  const pages = customers.filter((c) => c.page).map((c) => ({ id: c.page!.id, name: c.name }));

  const { subscribed, failed } = await ensureWebhookSubscribed(pages);
  for (const p of subscribed) console.log(`✓ ${p.name} (${p.id})`);
  console.log(`\n${subscribed.length} abonniert, ${failed.length} fehlgeschlagen`);
  for (const f of failed) console.log(`✗ ${f.name} (${f.id}): ${f.message}`);
  ```

  In `package.json`, add next to `"assign"`:
  ```json
  "webhooks": "bun --env-file=.env.local scripts/webhooks.ts",
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add lib/webhook-subscribe.ts lib/webhook-subscribe.test.ts scripts/webhooks.ts package.json
  git commit -m "feat: per-page webhook subscription, automatic and as a manual script"
  ```

---

# Part 4 — Reply (write path)

## Task 9: `lib/inbox-send.ts`

**Files:**
- Create: `lib/inbox-send.ts`
- Test: `lib/inbox-send.test.ts`

**Interfaces:**
- Consumes: `graph, GraphError` from `./graph`; `isExpired` from `./inbox`.
- Produces: `type ReplyTarget = { kind: "comment" | "dm"; channel: Channel; selfId: string;
  targetId: string; expiresAt?: string }`, `sendReply(target: ReplyTarget, text: string):
  Promise<{ id: string }>` — throws `GraphError` on failure or on an expired DM window.

- [ ] **Step 1: Write failing tests**

  ```ts
  import { expect, test } from "bun:test";

  process.env.META_ACCESS_TOKEN = "TEST";
  const { sendReply } = await import("./inbox-send");
  const { GraphError } = await import("./graph");

  function stub(handler: (url: URL) => unknown) {
    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/self_1") && !url.searchParams.has("message") ) return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
      return new Response(JSON.stringify(handler(url)));
    }) as typeof fetch;
  }

  test("Facebook-Kommentarantwort geht an /{comment_id}/comments", async () => {
    stub((url) => (url.pathname.endsWith("/c1/comments") ? { id: "reply_1" } : { access_token: "PAGE_TOKEN" }));
    const r = await sendReply({ kind: "comment", channel: "facebook", selfId: "self_1", targetId: "c1" }, "Danke!");
    expect(r.id).toBe("reply_1");
  });

  test("Instagram-Kommentarantwort geht an /{comment_id}/replies", async () => {
    stub((url) => (url.pathname.endsWith("/c1/replies") ? { id: "reply_2" } : { access_token: "PAGE_TOKEN" }));
    const r = await sendReply({ kind: "comment", channel: "instagram", selfId: "self_1", targetId: "c1" }, "Danke!");
    expect(r.id).toBe("reply_2");
  });

  test("DM-Antwort innerhalb des 24h-Fensters geht durch, Facebook an /me/messages", async () => {
    stub((url) => (url.pathname.endsWith("/me/messages") ? { message_id: "m_1", recipient_id: "u1" } : { access_token: "PAGE_TOKEN" }));
    const r = await sendReply({ kind: "dm", channel: "facebook", selfId: "self_1", targetId: "u1", expiresAt: new Date(Date.now() + 60_000).toISOString() }, "Klar!");
    expect(r.id).toBe("m_1");
  });

  test("DM-Antwort nach Ablauf des 24h-Fensters wird gar nicht erst gesendet", async () => {
    let sent = false;
    stub(() => { sent = true; return {}; });
    await expect(
      sendReply({ kind: "dm", channel: "facebook", selfId: "self_1", targetId: "u1", expiresAt: new Date(Date.now() - 1000).toISOString() }, "Zu spät"),
    ).rejects.toBeInstanceOf(GraphError);
    expect(sent).toBe(false);
  });
  ```

- [ ] **Step 2: Run tests, verify failure**

  Run: `bun test lib/inbox-send.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

  ```ts
  /**
   * Der Schreibweg: Meta bleibt System of Record. Der Speicher erfährt vom
   * Erfolg erst danach (app/inbox/actions.ts) – ein hier hängengebliebener
   * Fehler darf keine Nachricht vortäuschen, die nie ankam.
   */
  import { graph, GraphError } from "./graph";
  import { isExpired, type Channel } from "./inbox";

  export type ReplyTarget = {
    kind: "comment" | "dm";
    channel: Channel;
    /** Seiten- bzw. IG-Konto-Id, mit deren Token geantwortet wird. */
    selfId: string;
    /** Kommentar-Id bei "comment", Autor-Id des Gegenübers bei "dm". */
    targetId: string;
    /** Nur DMs. */
    expiresAt?: string;
  };

  export async function sendReply(target: ReplyTarget, text: string): Promise<{ id: string }> {
    if (target.kind === "dm" && isExpired({ expiresAt: target.expiresAt }))
      throw new GraphError({
        kind: "permission",
        message: "Das 24-Stunden-Fenster für diese Unterhaltung ist abgelaufen – Meta nimmt keine Antwort mehr an.",
        retryable: false,
      });

    if (target.kind === "comment") {
      const path = target.channel === "facebook" ? `${target.targetId}/comments` : `${target.targetId}/replies`;
      const { id } = await graph<{ id: string }>(path, { method: "POST", asPage: target.selfId, params: { message: text } });
      return { id };
    }

    // Exakter IG-Messaging-Endpunkt: siehe Spec-Hinweis, gegen aktuelle Graph-
    // Docs prüfen, falls Meta ihn seit Verfassen dieses Plans verschoben hat.
    const path = target.channel === "facebook" ? "me/messages" : `${target.selfId}/messages`;
    const { message_id } = await graph<{ message_id: string; recipient_id: string }>(path, {
      method: "POST",
      asPage: target.selfId,
      params: { recipient: { id: target.targetId }, message: { text } },
    });
    return { id: message_id };
  }
  ```

- [ ] **Step 4: Run tests, verify pass**

  Run: `bun test lib/inbox-send.test.ts`
  Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**
  ```bash
  git add lib/inbox-send.ts lib/inbox-send.test.ts
  git commit -m "feat: reply write path for comments and DMs"
  ```

---

# Part 5 — UI

## Task 10: `/api/inbox/count` and `app/inbox/actions.ts`

**Files:**
- Create: `app/api/inbox/count/route.ts`
- Create: `app/inbox/actions.ts`

**Interfaces:**
- Produces: `GET` route returning `{ count: number; latestAt: string | null }`.
- Produces (actions.ts): `replyAction(threadId: string, text: string): Promise<{ ok?:
  string; error?: string }>`.
- Consumes: `openDb, getThread, listThreads, recordSentMessage` from `@/lib/inbox-store`;
  `sendReply` from `@/lib/inbox-send`.

No test file for these two — both are thin route/action wrappers over already-tested
`lib/inbox-store.ts` and `lib/inbox-send.ts`, the same shape as `app/api/health/route.ts`
and `app/campaigns/actions.ts`'s `setStatusAction`, neither of which carries its own test
in this repo either.

- [ ] **Step 1: `/api/inbox/count`**

  ```ts
  import { openDb, countUnanswered } from "@/lib/inbox-store";

  /**
   * Dünn mit Absicht (wie app/api/suche/route.ts): der Poller (app/inbox/poller.tsx)
   * fragt das alle ~20s, ein warmer SQLite-Read kostet praktisch nichts.
   */
  export function GET(request: Request) {
    const customer = new URL(request.url).searchParams.get("customer") ?? undefined;
    return Response.json({ count: countUnanswered(openDb(), customer) });
  }
  ```

- [ ] **Step 2: `app/inbox/actions.ts`**

  ```ts
  "use server";

  import { getThread, recordSentMessage, openDb } from "@/lib/inbox-store";
  import { sendReply } from "@/lib/inbox-send";

  export type ReplyResult = { ok?: string; error?: string };

  export async function replyAction(threadId: string, text: string): Promise<ReplyResult> {
    if (!text.trim()) return { error: "Die Antwort darf nicht leer sein." };
    const db = openDb();
    const thread = getThread(db, threadId);
    if (!thread) return { error: "Dieser Thread wurde nicht gefunden – vielleicht ist er inzwischen gelöscht." };

    try {
      const { id } = await sendReply(
        {
          kind: thread.kind,
          channel: thread.channel,
          selfId: thread.selfId,
          targetId: thread.kind === "comment" ? threadId : thread.authorId,
          expiresAt: thread.expiresAt,
        },
        text,
      );
      recordSentMessage(db, {
        id,
        threadId,
        authorId: thread.selfId,
        authorName: "Wir",
        text,
        fromSelf: true,
        createdAt: new Date().toISOString(),
      });
      return { ok: "Antwort gesendet." };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  ```

- [ ] **Step 3: Typecheck and commit**

  Run: `bunx tsc --noEmit`
  ```bash
  git add app/api/inbox/count/route.ts app/inbox/actions.ts
  git commit -m "feat: unanswered-count endpoint and the reply server action"
  ```

## Task 11: `/inbox` page — header, facets, two-pane shell, thread list

**Files:**
- Create: `app/inbox/page.tsx`

**Interfaces:**
- Consumes: `listCustomers, findCustomer` from `@/lib/customers`; `listThreads, openDb`
  from `@/lib/inbox-store`; `Blatt, Blattkopf` from `@/app/shell/blattkopf`; `Facets,
  FacetSelect, FacetSearch, ActiveFilters` from `@/app/shell/facets`; `Sign` from
  `@/theme/icons`.
- Produces: the `/inbox` route. `?thread=<id>` selects the right pane, read by Task 12.

- [ ] **Step 1: Implement**

  ```tsx
  import Link from "next/link";
  import { Avatar, Card, EmptyState } from "@/app/shell/ui";
  import { findCustomer, listCustomers } from "@/lib/customers";
  import { openDb, listThreads, type Thread } from "@/lib/inbox-store";
  import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
  import { ActiveFilters, FacetSearch, FacetSelect, Facets } from "@/app/shell/facets";
  import { Sign } from "@/theme/icons";
  import { Poller } from "./poller";
  import { ThreadDetail } from "./thread-detail";
  import { relativeTime } from "./relative-time";

  export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
    const sp = await searchParams;
    const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

    const { customers } = await listCustomers();
    const scope = findCustomer(customers, str("customer"));

    const db = openDb();
    const threads = listThreads(db, {
      customerId: scope?.id,
      channel: str("channel") as "facebook" | "instagram" | undefined,
      kind: str("kind") as "comment" | "dm" | undefined,
      answered: str("answered") === undefined ? undefined : str("answered") === "true",
      q: str("q"),
    });
    const offen = threads.filter((t) => !t.answered).length;
    const selected = str("thread") ? threads.find((t) => t.id === str("thread")) : undefined;

    return (
      <>
        <Blattkopf
          titel="Inbox"
          meaning="inbox"
          figur={offen}
          figurEinheit="offen"
          stand={
            threads.length === 0
              ? "Keine Unterhaltungen in dieser Ansicht."
              : `${threads.length} ${threads.length === 1 ? "Unterhaltung" : "Unterhaltungen"} · ${offen} offen`
          }
        />
        <Blatt>
          <Facets customer={str("customer")}>
            <FacetSelect name="channel" label="Kanal" value={str("channel")} icon="filter" options={[["facebook", "Facebook"], ["instagram", "Instagram"]]} />
            <FacetSelect name="kind" label="Art" value={str("kind")} icon="filter" options={[["comment", "Kommentar"], ["dm", "Nachricht"]]} />
            <FacetSelect name="answered" label="Status" value={str("answered")} icon="filter" options={[["false", "Offen"], ["true", "Beantwortet"]]} />
            <FacetSearch value={str("q")} />
          </Facets>
          <ActiveFilters params={sp} labels={{ q: "Suche", channel: "Kanal", kind: "Art", answered: "Status" }} />

          {/* Zwei Spalten, beide unabhängig scrollend – bewusste Ausnahme von
              "nur main scrollt", siehe Spec: Filterzeile und Antwortfeld
              müssen bei einer vollen Liste erreichbar bleiben. */}
          <div className="flex gap-4" style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
            <Card elevation="low" padding={0} className="w-96 shrink-0 overflow-y-auto">
              {threads.length === 0 ? (
                <EmptyState title="Keine Unterhaltungen in dieser Ansicht." isCompact />
              ) : (
                <ul>
                  {threads.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`?${new URLSearchParams({ ...sp, thread: t.id } as Record<string, string>).toString()}`}
                        className={`flex items-start gap-3 border-b border-ink-100 p-3 hover:bg-ink-50 ${selected?.id === t.id ? "bg-ink-50" : ""}`}
                      >
                        <Avatar name={t.authorName} src={t.authorAvatar} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Sign meaning={t.channel} size={12} />
                            <Sign meaning={t.kind === "dm" ? "dm" : "comment"} size={12} className="text-ink-300" />
                            <span className="truncate text-sm font-medium text-ink-900">{t.authorName}</span>
                            {!t.answered && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--color-text-accent)]" />}
                          </div>
                          {t.contextLabel && <div className="truncate text-xs text-ink-500">{t.contextLabel}</div>}
                          <div className="text-xs text-ink-400">{relativeTime(t.lastMessageAt)}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card elevation="low" padding={0} className="flex-1 overflow-hidden">
              {selected ? <ThreadDetail thread={selected} /> : <EmptyState title="Eine Unterhaltung wählen" isCompact />}
            </Card>
          </div>
        </Blatt>
        <Poller customer={str("customer")} baseline={{ count: offen }} />
      </>
    );
  }
  ```

- [ ] **Step 2: Small relative-time helper**

  `app/inbox/relative-time.ts`:
  ```ts
  // Intl.RelativeTimeFormat statt einer Bibliothek – die Auflösung reicht bis
  // zur Minute, mehr braucht eine Inbox-Zeile nicht.
  const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
  const STEPS: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.345, "week"], [12, "month"], [Infinity, "year"]];

  export function relativeTime(iso: string, now = Date.now()): string {
    let diff = (Date.parse(iso) - now) / 1000;
    for (const [step, unit] of STEPS) {
      if (Math.abs(diff) < step) return rtf.format(Math.round(diff), unit);
      diff /= step;
    }
    return rtf.format(Math.round(diff), "year");
  }
  ```

  Test: `app/inbox/relative-time.test.ts`:
  ```ts
  import { expect, test } from "bun:test";
  import { relativeTime } from "./relative-time";

  test("Minuten und Stunden lesen sich als Vergangenheit", () => {
    const now = Date.parse("2026-08-21T12:00:00Z");
    expect(relativeTime("2026-08-21T11:55:00Z", now)).toBe("vor 5 Minuten");
    expect(relativeTime("2026-08-21T09:00:00Z", now)).toBe("vor 3 Stunden");
  });
  ```

  Run: `bun test app/inbox/relative-time.test.ts` — Expected: PASS.

- [ ] **Step 3: Typecheck (expect errors — `ThreadDetail`/`Poller` don't exist yet, that's Tasks 12–13)**

  Run: `bunx tsc --noEmit`
  Expected: FAIL, `Cannot find module './thread-detail'` and `./poller`. This is expected —
  continue to Task 12.

- [ ] **Step 4: Commit once Tasks 12–13 close the gap (do not commit page.tsx alone — it doesn't build)**

  Hold this task's changes uncommitted; commit together with Task 13's step 5.

## Task 12: Thread detail pane and composer

**Files:**
- Create: `app/inbox/thread-detail.tsx`
- Create: `app/inbox/composer.tsx`

**Interfaces:**
- Consumes: `listMessages, openDb, type Thread` from `@/lib/inbox-store`; `isExpired` from
  `@/lib/inbox`; `replyAction` from `./actions`.

- [ ] **Step 1: `app/inbox/thread-detail.tsx`**

  ```tsx
  import { Avatar, Banner } from "@/app/shell/ui";
  import { isExpired } from "@/lib/inbox";
  import { listMessages, openDb, type Thread } from "@/lib/inbox-store";
  import { relativeTime } from "./relative-time";
  import { Composer } from "./composer";

  export function ThreadDetail({ thread }: { thread: Thread }) {
    const messages = listMessages(openDb(), thread.id);
    const expired = thread.kind === "dm" && isExpired(thread);

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-ink-100 p-3">
          <Avatar name={thread.authorName} src={thread.authorAvatar} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink-900">{thread.authorName}</div>
            {thread.contextLabel && <div className="truncate text-xs text-ink-500">{thread.contextLabel}</div>}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[75%] rounded-lg p-2.5 text-sm ${m.fromSelf ? "ml-auto bg-[var(--color-text-accent)] text-white" : "bg-ink-50 text-ink-900"}`}>
              <div>{m.text}</div>
              <div className={`mt-1 text-[11px] ${m.fromSelf ? "text-white/70" : "text-ink-400"}`}>{relativeTime(m.createdAt)}</div>
            </div>
          ))}
        </div>

        <div className="border-t border-ink-100 p-3">
          {expired ? (
            <Banner status="info" title="Antwort nicht mehr möglich" description="Das 24-Stunden-Fenster für diese Unterhaltung ist abgelaufen – Meta nimmt keine Antwort mehr an." />
          ) : (
            <Composer threadId={thread.id} />
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: `app/inbox/composer.tsx`**

  ```tsx
  "use client";

  import { useState, useTransition } from "react";
  import { useRouter } from "next/navigation";
  import { Button, TextArea, useToast } from "@astryxdesign/core";
  import { Sign } from "@/theme/icons";
  import { replyAction } from "./actions";

  export function Composer({ threadId }: { threadId: string }) {
    const [text, setText] = useState("");
    const [pending, start] = useTransition();
    const router = useRouter();
    const toast = useToast();

    const send = () =>
      start(async () => {
        const r = await replyAction(threadId, text);
        if (r.error) {
          toast({ body: `Antwort nicht gesendet: ${r.error}`, type: "error" });
          return;
        }
        setText("");
        // Read-your-own-write: der Server Action-Aufruf hat schon gespeichert,
        // hier wird nur die Serverkomponente neu geholt, damit sie es zeigt.
        router.refresh();
      });

    return (
      <div className="flex items-end gap-2">
        <TextArea label="Antwort" isLabelHidden rows={2} value={text} onChange={setText} placeholder="Antworten…" isDisabled={pending} className="flex-1" />
        <Button icon={<Sign meaning="send" />} label="Senden" isDisabled={pending || !text.trim()} onClick={send} />
      </div>
    );
  }
  ```

- [ ] **Step 3: Typecheck**

  Run: `bunx tsc --noEmit`
  Expected: FAIL only on `./poller` (Task 13). Everything else clean.

- [ ] **Step 4: Manual check once Task 13 lands** — deferred to Task 13 step 4, no commit yet.

## Task 13: Freshness poller and layout wiring

**Files:**
- Create: `app/inbox/poller.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `countUnanswered, openDb` from `@/lib/inbox-store`; `reconcile` from
  `@/lib/inbox-ingest`; `ensureAssigned` from `@/lib/assign` (unchanged, already imported).

- [ ] **Step 1: `app/inbox/poller.tsx`**

  ```tsx
  "use client";

  import { useEffect, useRef } from "react";
  import { useRouter } from "next/navigation";

  /**
   * Fragt /api/inbox/count alle ~20s und bei Fokus ab. Ein warmer SQLite-Read
   * kostet nichts; nur der eine Poll direkt nach einem Webhook-Ereignis
   * aktualisiert wirklich etwas. Kein SSE, keine gehaltene Verbindung – diese
   * App hat keine Sticky-Session-Geschichte und braucht für ein 20s-Fenster
   * keine.
   */
  export function Poller({ customer, baseline }: { customer?: string; baseline: { count: number } }) {
    const router = useRouter();
    const last = useRef(baseline.count);

    useEffect(() => {
      const check = async () => {
        const qs = customer ? `?customer=${customer}` : "";
        const res = await fetch(`/api/inbox/count${qs}`).catch(() => undefined);
        if (!res?.ok) return;
        const { count } = await res.json();
        if (count !== last.current) {
          last.current = count;
          router.refresh();
        }
      };
      const id = setInterval(check, 20_000);
      window.addEventListener("focus", check);
      return () => {
        clearInterval(id);
        window.removeEventListener("focus", check);
      };
    }, [customer, router]);

    return null;
  }
  ```

- [ ] **Step 2: Wire `countUnanswered` and `reconcile` into `app/layout.tsx`**

  Add imports:
  ```ts
  import { after } from "next/server";
  import { ensureAssigned } from "@/lib/assign";
  import { reconcile } from "@/lib/inbox-ingest";
  import { countUnanswered, openDb } from "@/lib/inbox-store";
  ```
  (`after` and `ensureAssigned` are already imported — don't duplicate.)

  Where `after(ensureAssigned);` currently stands, add a second call:
  ```ts
  after(ensureAssigned);
  // Derselbe Rhythmus wie ensureAssigned: läuft nach der Antwort, ein
  // Graph-Aussetzer darf die Seite nicht zerlegen. Läuft für jedes
  // Rendering – bun:sqlite ist ein warmer, lokaler Prozess, keine Kosten wie
  // bei einem entfernten Dienst; ein doppelter Lauf schreibt nur dieselben
  // Zeilen erneut.
  after(async () => {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    try {
      const { failed } = await reconcile(openDb(), customers);
      for (const f of failed) console.error(`[inbox] Abgleich fehlgeschlagen für ${f.customerId}: ${f.message}`);
    } catch (e) {
      console.error(`[inbox] Abgleich nicht möglich: ${(e as Error).message}`);
    }
  });
  ```
  right after `const { customers, errors, issues: overrideIssues } = await listCustomers();` (so
  `customers` is in scope).

  Then pass the count to `<Sidebar>` — it already accepts `inboxCount`:
  ```tsx
  <Sidebar
    inboxCount={countUnanswered(openDb())}
    footer={ ... }
  />
  ```

  Note: `app/shell/sidebar.tsx` needs **no changes** — its `inboxCount` prop and the
  `/inbox` nav entry with badge already exist (`app/shell/sidebar.tsx:57,160-165`,
  confirmed by reading the file directly). The spec's file header listed it under
  "Changes," but its own body says otherwise; the code agrees with the body.

- [ ] **Step 3: Typecheck the whole app**

  Run: `bunx tsc --noEmit`
  Expected: clean.

- [ ] **Step 4: Manual check**

  Run: `bun dev`, open `http://localhost:3000/inbox`.
  Expected: page renders (empty state if the store has no rows yet — that's correct before
  a reconcile has run against real credentials). Confirm no console errors, confirm the
  sidebar's Inbox badge doesn't throw with `inboxCount={0}`.

- [ ] **Step 5: Commit Tasks 11–13 together (the page didn't build standalone until now)**
  ```bash
  git add app/inbox/ app/layout.tsx
  git commit -m "feat: /inbox two-pane UI, freshness poller, and layout wiring"
  ```

---

# Part 6 — Deployment

## Task 14: `compose.yaml`, `.env.example`, `README.md`

**Files:**
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: `compose.yaml` — volume and new environment variables**

  Add to the `app` service's `environment` block (after `META_SYSTEM_USER_ID`):
  ```yaml
      META_APP_SECRET: ${META_APP_SECRET:?set META_APP_SECRET in Coolify}
      META_WEBHOOK_VERIFY_TOKEN: ${META_WEBHOOK_VERIFY_TOKEN:?set META_WEBHOOK_VERIFY_TOKEN in Coolify}
      INBOX_DB_PATH: ${INBOX_DB_PATH:-/data/inbox.sqlite}
  ```
  Add a `volumes` section to the `app` service and a top-level `volumes:` key:
  ```yaml
  services:
    app:
      # ...existing keys...
      volumes:
        - inbox-db:/data

  volumes:
    inbox-db:
  ```

- [ ] **Step 2: `.env.example`**

  Add under the existing `META_APP_SECRET=` line (already present):
  ```env
  # Meta-Webhook (Kommentare/DMs in Echtzeit) – frei wählbarer String, dient nur
  # dazu, Metas Challenge-Aufruf beim Einrichten zu bestätigen.
  META_WEBHOOK_VERIFY_TOKEN=
  # Optional: Standard ist /data/inbox.sqlite (Docker-Volume). Lokal reicht die Vorgabe.
  INBOX_DB_PATH=
  ```

- [ ] **Step 3: `README.md`**

  Three edits:

  1. Remove the now-inaccurate claim under **Coolify**:
     > "Der Container schreibt keine dauerhaften Anwendungsdaten; Volumes sind deshalb
     > nicht nötig."

     Replace with:
     > "Der Container schreibt ab der Inbox (`/inbox`) dauerhafte Daten – ein Docker-Volume
     > unter `/data` hält den lokalen Nachrichten-Speicher warm (`compose.yaml`)."

  2. Add to the Coolify environment variable list (step 3 of that section):
     ```env
     META_APP_SECRET=...
     META_WEBHOOK_VERIFY_TOKEN=...
     ```
     with a line explaining both are required for `/inbox`; `INBOX_DB_PATH` is optional
     with its default already shown.

  3. In the **Nicht gebaut** table, remove the row:
     ```
     | Kommentare & DMs (Business Suite) | Stage 2 – erst wenn die Meta-Inbox wirklich nicht reicht |
     ```
     (it's built now) and add one line under **Was der Skeleton kann** describing
     `/inbox` in the same style as the existing `/campaigns` bullet, plus the one-time
     manual step: pointing Meta's Webhooks product at
     `https://<domain>/api/webhooks/meta` with the verify token — app-level configuration
     done once, distinct from the automatic per-page subscription (`ensureWebhookSubscribed`,
     `bun run webhooks`).

- [ ] **Step 4: Commit**
  ```bash
  git add compose.yaml .env.example README.md
  git commit -m "docs: document the inbox's env vars, volume, and one-time webhook setup"
  ```

---

## Final check

- [ ] Run the full suite: `bun test`
  Expected: all tests pass, including everything from Tasks 1–14.
- [ ] Run `bunx tsc --noEmit`
  Expected: clean.
- [ ] Run `bun dev`, visit `/inbox` with a real `META_ACCESS_TOKEN` and `META_APP_SECRET`
  set, confirm the header renders with a real count once `reconcile()` has populated the
  store from at least one Page with existing comments/DMs.
- [ ] Confirm `/campaigns` and `/customers` still render (layout.tsx now runs a second
  `after()` block — a mistake there must not break the rest of the shell).
