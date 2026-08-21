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
import { createRequire } from "node:module";
// Nur ein Typ-Import (wird beim Kompilieren entfernt) – next builds
// Node-Worker werten dieses Modul aus, dürfen bun:sqlite aber nie laden.
// Nur der Bun-Laufzeitpfad ruft openDb() unten wirklich auf.
import type { Database as DatabaseType } from "bun:sqlite";
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

export function initSchema(db: DatabaseType): void {
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

let singleton: DatabaseType | undefined;

/** Ein Prozess, eine Verbindung – bun:sqlite ist synchron, ein zweites Handle brächte nichts. */
export function openDb(path = process.env.INBOX_DB_PATH ?? "/data/inbox.sqlite"): DatabaseType {
  if (singleton) return singleton;
  // Erst hier, beim tatsächlichen Aufruf, wird bun:sqlite geladen – nie beim
  // Modul-Import (siehe Kommentar oben).
  const { Database } = createRequire(import.meta.url)("bun:sqlite") as typeof import("bun:sqlite");
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

export function upsertThread(db: DatabaseType, t: Thread): void {
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

export function insertMessage(db: DatabaseType, m: Message): void {
  // OR IGNORE: derselbe Kommentar/dieselbe Nachricht kommt über Webhook und
  // Reconcile doppelt vorbei – die Id ist Metas eigene, ein zweiter Schreib-
  // versuch ist ein No-Op, kein Fehler.
  db.query(
    `INSERT OR IGNORE INTO messages (id, thread_id, author_id, author_name, text, from_self, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(m.id, m.threadId, m.authorId, m.authorName, m.text, m.fromSelf ? 1 : 0, m.createdAt);
}

export function listThreads(db: DatabaseType, f: ThreadFilter): Thread[] {
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
  return db.query(sql).all(...(params as any[])).map(toThread);
}

export const getThread = (db: DatabaseType, id: string): Thread | undefined => {
  const row = db.query("SELECT * FROM threads WHERE id = ?").get(id);
  return row ? toThread(row) : undefined;
};

export const listMessages = (db: DatabaseType, threadId: string): Message[] =>
  db.query("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC").all(threadId).map(toMessage);

export const countUnanswered = (db: DatabaseType, customerId?: string): number => {
  if (customerId) {
    return (db.query(
      `SELECT COUNT(*) AS n FROM threads WHERE answered = 0 AND customer_id = ?`,
    ).get(customerId) as { n: number }).n;
  }
  return (db.query(
    `SELECT COUNT(*) AS n FROM threads WHERE answered = 0`,
  ).get() as { n: number }).n;
};

/** Schreibpfad einer gesendeten Antwort: Nachricht ablegen, Thread in einem Schritt beantworten. */
export function recordSentMessage(db: DatabaseType, m: Message): void {
  insertMessage(db, m);
  db.query(
    "UPDATE threads SET answered = 1, last_message_at = ?, updated_at = ? WHERE id = ?",
  ).run(m.createdAt, m.createdAt, m.threadId);
}
