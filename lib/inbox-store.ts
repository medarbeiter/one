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
  /** Der Beitrag bei Meta – das Ziel von "Beitrag ansehen" in der Detailspalte. */
  contextPermalink?: string;
  contextAdId?: string;
  postId?: string;
  answered: boolean;
  lastMessageAt: string;
  expiresAt?: string;
  note?: string;
  snoozedUntil?: string;
  updatedAt: string;
  /**
   * Abgeleitet beim Lesen, nicht gespeichert: die Nachricht, der ein Like
   * gilt. Bei Kommentaren der Kommentar selbst, bei DMs die neueste
   * eingegangene – was man in der Liste ohne Öffnen liken können muss.
   */
  likeTargetId?: string;
  liked?: boolean;
  /**
   * Abgeleitet, nicht gespeichert: gelesen heißt „gelesen, nachdem das
   * Letzte gesagt wurde". Ein neuer Kommentar setzt die Zeile damit von
   * allein wieder auf ungelesen – ohne dass ein Schreibpfad daran denken muss.
   */
  read?: boolean;
  /**
   * Der zuletzt gesagte Satz. Steht nicht in threads, sondern wird beim Lesen
   * mitgezogen: in einer Liste über 200 Auftritte ist "was steht da" die Frage,
   * die entscheidet, ob man öffnet – der Beitragstitel beantwortet sie nicht.
   */
  lastText?: string;
};

export type Message = {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  fromSelf: boolean;
  createdAt: string;
  liked?: boolean;
  /**
   * Worauf diese Nachricht antwortet – bei Facebook-Kommentaren Metas
   * `parent`, das auch zwei Ebenen tief noch stimmt. Leer beim ersten
   * Kommentar eines Threads und bei Nachrichten (Messenger kennt kein Zitat).
   */
  parentId?: string;
};

export type ThreadFilter = {
  customerId?: string;
  channel?: Channel;
  kind?: "comment" | "dm";
  answered?: boolean;
  q?: string;
  /** Deckel der Listenspalte. 1500 Zeilen als DOM zu bauen kostet mehr, als eine Spalte je zeigt. */
  limit?: number;
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
      context_permalink TEXT,
      context_ad_id TEXT,
      post_id TEXT,
      answered INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT NOT NULL,
      expires_at TEXT,
      note TEXT,
      snoozed_until TEXT,
      read_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id),
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      text TEXT NOT NULL,
      from_self INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      liked INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threads_activity ON threads(last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_threads_customer ON threads(customer_id);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
  `);
  // CREATE TABLE IF NOT EXISTS legt in einer schon bestehenden Datei keine
  // neue Spalte nach. Der Fehlschlag hier heißt genau eins: gibt es bereits.
  try {
    db.exec("ALTER TABLE threads ADD COLUMN context_permalink TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN liked INTEGER NOT NULL DEFAULT 0");
  } catch {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN parent_id TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN author_avatar TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE threads ADD COLUMN read_at TEXT");
  } catch {}
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
  contextPermalink: r.context_permalink ?? undefined,
  contextAdId: r.context_ad_id ?? undefined,
  postId: r.post_id ?? undefined,
  answered: !!r.answered,
  lastMessageAt: r.last_message_at,
  expiresAt: r.expires_at ?? undefined,
  note: r.note ?? undefined,
  snoozedUntil: r.snoozed_until ?? undefined,
  updatedAt: r.updated_at,
  likeTargetId: r.like_target ?? undefined,
  liked: !!r.like_liked,
  read: !!r.is_read,
  lastText: r.last_text ?? undefined,
});

const toMessage = (r: any): Message => ({
  id: r.id,
  threadId: r.thread_id,
  authorId: r.author_id,
  authorName: r.author_name,
  authorAvatar: r.author_avatar ?? undefined,
  text: r.text,
  fromSelf: !!r.from_self,
  createdAt: r.created_at,
  liked: !!r.liked,
  parentId: r.parent_id ?? undefined,
});

export function upsertThread(db: DatabaseType, t: Thread): void {
  db.query(
    `INSERT INTO threads (
      id, kind, channel, customer_id, self_id, author_id, author_name, author_avatar,
      context_label, context_thumbnail, context_permalink, context_ad_id, post_id, answered,
      last_message_at, expires_at, note, snoozed_until, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      answered = excluded.answered,
      last_message_at = excluded.last_message_at,
      author_name = excluded.author_name,
      author_avatar = excluded.author_avatar,
      context_label = excluded.context_label,
      context_thumbnail = excluded.context_thumbnail,
      context_permalink = excluded.context_permalink,
      context_ad_id = excluded.context_ad_id,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at`,
  ).run(
    t.id, t.kind, t.channel, t.customerId, t.selfId, t.authorId, t.authorName, t.authorAvatar ?? null,
    t.contextLabel ?? null, t.contextThumbnail ?? null, t.contextPermalink ?? null, t.contextAdId ?? null, t.postId ?? null,
    t.answered ? 1 : 0, t.lastMessageAt, t.expiresAt ?? null, t.note ?? null, t.snoozedUntil ?? null,
    t.updatedAt,
  );
}

export function insertMessage(db: DatabaseType, m: Message): void {
  // Derselbe Kommentar kommt über Webhook und Reconcile doppelt vorbei – die
  // Id ist Metas eigene. Ein zweiter Schreibversuch ist trotzdem kein reines
  // No-Op: Name, Bild und Elternbezug schreibt er nach. Ohne das bliebe jede
  // Zeile, die vor diesen Feldern angelegt wurde, für immer ohne sie – und
  // Metas Bild-Adressen laufen ohnehin ab und wollen erneuert werden.
  // COALESCE: was Meta diesmal nicht mitschickt (Instagram kennt weder Bild
  // noch Elternbezug), löscht nicht, was schon dasteht.
  // `liked` bleibt unberührt – das ist unsere Seite, nicht Metas.
  db.query(
    `INSERT INTO messages (id, thread_id, author_id, author_name, author_avatar, text, from_self, created_at, parent_id)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       author_name = excluded.author_name,
       author_avatar = COALESCE(excluded.author_avatar, author_avatar),
       parent_id = COALESCE(excluded.parent_id, parent_id),
       text = excluded.text`,
  ).run(m.id, m.threadId, m.authorId, m.authorName, m.authorAvatar ?? null, m.text, m.fromSelf ? 1 : 0, m.createdAt, m.parentId ?? null);
}

/**
 * Das Like-Ziel in einem Rutsch mitlesen: erst der Kommentar selbst (seine Id
 * ist die des Threads), sonst die neueste eingegangene Nachricht – das ist der
 * DM-Fall. Kein CASE im ORDER BY: SQLite löst `t.id` nur in WHERE auf, in der
 * Sortierung einer Unterabfrage kennt es die äußere Zeile nicht.
 */
const likeCol = (col: string) => `COALESCE(
    (SELECT m.${col} FROM messages m WHERE m.id = t.id),
    (SELECT m.${col} FROM messages m WHERE m.thread_id = t.id AND m.from_self = 0
       ORDER BY m.created_at DESC LIMIT 1)
  )`;
const THREAD_SELECT = `SELECT t.*, ${likeCol("id")} AS like_target, ${likeCol("liked")} AS like_liked,
    (t.read_at IS NOT NULL AND t.read_at >= t.last_message_at) AS is_read,
    (SELECT m.text FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_text
  FROM threads t`;

function filterOf(f: ThreadFilter): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.customerId) { where.push("t.customer_id = ?"); params.push(f.customerId); }
  if (f.channel) { where.push("t.channel = ?"); params.push(f.channel); }
  if (f.kind) { where.push("t.kind = ?"); params.push(f.kind); }
  if (f.answered !== undefined) { where.push("t.answered = ?"); params.push(f.answered ? 1 : 0); }
  if (f.q) {
    // Der gesuchte Satz steht in den Nachrichten, nicht im Thread – wer nach
    // einem Wort aus einem Kommentar sucht, sucht genau danach.
    // Dreimal derselbe Wert statt ?1: benannte und anonyme Platzhalter in
    // einer Anweisung zu mischen bringt SQLite durcheinander – ein `?` weiter
    // oben wäre schon ?1 und beide bekämen denselben Wert.
    where.push(`(t.author_name LIKE ? OR t.context_label LIKE ?
      OR EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.text LIKE ?))`);
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export function listThreads(db: DatabaseType, f: ThreadFilter): Thread[] {
  const { sql: where, params } = filterOf(f);
  // Offenes zuerst: beantwortet ist erledigt und darf nach unten, egal wie neu.
  const sql = `${THREAD_SELECT} ${where}
    ORDER BY t.answered ASC, t.last_message_at DESC
    ${f.limit ? "LIMIT ?" : ""}`;
  if (f.limit) params.push(f.limit);
  return db.query(sql).all(...(params as any[])).map(toThread);
}

/** Der Kopf zählt die ganze Auswahl, auch wenn die Spalte nur den Deckel zeigt. */
export function countThreads(db: DatabaseType, f: ThreadFilter): { total: number; open: number } {
  const { sql: where, params } = filterOf(f);
  const r = db.query(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN t.answered = 0 THEN 1 ELSE 0 END) AS open
     FROM threads t ${where}`,
  ).get(...(params as any[])) as { total: number; open: number | null };
  return { total: r.total, open: r.open ?? 0 };
}

export const getThread = (db: DatabaseType, id: string): Thread | undefined => {
  const row = db.query(`${THREAD_SELECT} WHERE t.id = ?`).get(id);
  return row ? toThread(row) : undefined;
};

/** Zählt, über wie viele Kunden sich die offenen Unterhaltungen verteilen. */
export const countOpenCustomers = (db: DatabaseType, customerId?: string): number =>
  (db.query(
    `SELECT COUNT(DISTINCT customer_id) AS n FROM threads WHERE answered = 0
     ${customerId ? "AND customer_id = ?" : ""}`,
  ).get(...(customerId ? [customerId] : [])) as { n: number }).n;

/** Der älteste offene Thread – das Alter, das ein Kunde als Schweigen erlebt. */
export const oldestOpen = (db: DatabaseType, customerId?: string): string | undefined =>
  (db.query(
    `SELECT MIN(last_message_at) AS t FROM threads WHERE answered = 0
     ${customerId ? "AND customer_id = ?" : ""}`,
  ).get(...(customerId ? [customerId] : [])) as { t: string | null }).t ?? undefined;

/** Metas Like ist gesetzt; hier nur nachgezogen, damit das Herz gefüllt bleibt. */
export const setMessageLiked = (db: DatabaseType, messageId: string, liked: boolean): void => {
  db.query("UPDATE messages SET liked = ? WHERE id = ?").run(liked ? 1 : 0, messageId);
};

/** Gelesen ist ein Zeitpunkt, kein Haken – siehe `read` oben in Thread. */
export const setThreadRead = (db: DatabaseType, threadId: string, read: boolean, at = new Date().toISOString()): void => {
  db.query("UPDATE threads SET read_at = ? WHERE id = ?").run(read ? at : null, threadId);
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

/**
 * Ein bei Meta gelöschter Kommentar ist auch hier keiner mehr: erst die
 * Nachrichten (sie verweisen auf den Thread), dann der Thread selbst. Der
 * Abgleich holt ihn nicht zurück – er existiert dort ja nicht mehr.
 */
export function deleteThread(db: DatabaseType, id: string): void {
  db.query("DELETE FROM messages WHERE thread_id = ?").run(id);
  db.query("DELETE FROM threads WHERE id = ?").run(id);
}

/** Schreibpfad einer gesendeten Antwort: Nachricht ablegen, Thread in einem Schritt beantworten. */
export function recordSentMessage(db: DatabaseType, m: Message): void {
  insertMessage(db, m);
  db.query(
    "UPDATE threads SET answered = 1, last_message_at = ?, updated_at = ? WHERE id = ?",
  ).run(m.createdAt, m.createdAt, m.threadId);
}
