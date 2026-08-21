/**
 * bun:sqlite direkt gegen eine :memory:-Datenbank – kein Mock, die echte
 * Engine ist schnell genug und die Testfälle sind genau die Stellen, an
 * denen SQL leise falsch sein kann (Upsert, abgeleitete Spalten, Filter).
 */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  countThreads,
  countUnanswered,
  getThread,
  initSchema,
  insertMessage,
  listMessages,
  listThreads,
  recordSentMessage,
  setMessageLiked,
  setThreadRead,
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

test("die Liste zieht Like-Ziel, Like-Zustand und den zuletzt gesagten Satz mit", () => {
  const db = freshDb();
  upsertThread(db, thread({ id: "c1", kind: "comment" }));
  upsertThread(db, thread({ id: "t1", kind: "dm", lastMessageAt: "2026-08-20T10:00:00.000Z" }));
  // Der Kommentar selbst trägt die Id des Threads.
  insertMessage(db, { id: "c1", threadId: "c1", authorId: "u1", authorName: "Anna", text: "Wie bewerbe ich mich?", fromSelf: false, createdAt: "2026-08-20T09:00:00.000Z" });
  insertMessage(db, { id: "r1", threadId: "c1", authorId: "page_1", authorName: "Wir", text: "Per Mail!", fromSelf: true, createdAt: "2026-08-20T09:30:00.000Z" });
  // In der DM ist die neueste eingegangene Nachricht das Ziel, nicht die eigene.
  insertMessage(db, { id: "m1", threadId: "t1", authorId: "u1", authorName: "Anna", text: "Hallo?", fromSelf: false, createdAt: "2026-08-20T09:00:00.000Z" });
  insertMessage(db, { id: "m2", threadId: "t1", authorId: "u1", authorName: "Anna", text: "Seid ihr noch da?", fromSelf: false, createdAt: "2026-08-20T10:00:00.000Z" });
  insertMessage(db, { id: "m3", threadId: "t1", authorId: "page_1", authorName: "Wir", text: "Ja!", fromSelf: true, createdAt: "2026-08-20T10:05:00.000Z" });
  setMessageLiked(db, "m2", true);

  const byId = new Map(listThreads(db, {}).map((t) => [t.id, t]));
  expect(byId.get("c1")).toMatchObject({ likeTargetId: "c1", liked: false, lastText: "Per Mail!" });
  expect(byId.get("t1")).toMatchObject({ likeTargetId: "m2", liked: true, lastText: "Ja!" });
  expect(getThread(db, "t1")?.likeTargetId).toBe("m2");
});

test("Offenes steht oben, der Deckel schneidet ab, gezählt wird trotzdem alles", () => {
  const db = freshDb();
  // Das Beantwortete ist das Neueste – ohne die Sortierung stünde es zuoberst.
  upsertThread(db, thread({ id: "alt", answered: false, lastMessageAt: "2026-08-19T09:00:00.000Z" }));
  upsertThread(db, thread({ id: "neu", answered: true, lastMessageAt: "2026-08-21T09:00:00.000Z" }));

  expect(listThreads(db, {}).map((t) => t.id)).toEqual(["alt", "neu"]);
  expect(listThreads(db, { limit: 1 }).map((t) => t.id)).toEqual(["alt"]);
  expect(countThreads(db, {})).toEqual({ total: 2, open: 1 });
});

test("die Suche findet auch ein Wort aus dem Kommentartext, nicht nur Name und Beitragstitel", () => {
  const db = freshDb();
  upsertThread(db, thread({ id: "c1", contextLabel: "Sommerfest" }));
  insertMessage(db, { id: "c1", threadId: "c1", authorId: "u1", authorName: "Anna", text: "Sucht ihr Nachtwachen?", fromSelf: false, createdAt: "2026-08-20T09:00:00.000Z" });

  expect(listThreads(db, { q: "Nachtwachen" }).map((t) => t.id)).toEqual(["c1"]);
  expect(listThreads(db, { q: "Sommerfest" }).map((t) => t.id)).toEqual(["c1"]);
  expect(listThreads(db, { q: "Fahrdienst" })).toHaveLength(0);
  // Zusammen mit einem zweiten Filter: hier gingen numerierte und anonyme
  // Platzhalter in einer Anweisung schief.
  expect(listThreads(db, { customerId: "acme", q: "Nachtwachen" }).map((t) => t.id)).toEqual(["c1"]);
  expect(listThreads(db, { customerId: "andere", q: "Nachtwachen" })).toHaveLength(0);
  expect(countThreads(db, { customerId: "acme", q: "Nachtwachen" })).toEqual({ total: 1, open: 1 });
});

test("gelesen gilt nur bis zur nächsten Nachricht in diesem Thread", () => {
  const db = freshDb();
  upsertThread(db, thread());
  expect(getThread(db, "c1")?.read).toBe(false);

  setThreadRead(db, "c1", true, "2026-08-20T09:30:00.000Z");
  expect(getThread(db, "c1")?.read).toBe(true);

  // Neue Antwort im selben Thread: der Haken von vorhin gilt ihr nicht.
  upsertThread(db, thread({ lastMessageAt: "2026-08-20T10:00:00.000Z" }));
  expect(getThread(db, "c1")?.read).toBe(false);

  setThreadRead(db, "c1", false, "2026-08-20T11:00:00.000Z");
  expect(getThread(db, "c1")?.read).toBe(false);
});

test("eine Antwort merkt sich, worauf sie antwortet", () => {
  const db = freshDb();
  upsertThread(db, thread());
  insertMessage(db, message({ id: "c1" }));
  insertMessage(db, message({ id: "r1", createdAt: "2026-08-20T09:05:00.000Z", parentId: "c1", authorAvatar: "https://x/a.jpg" }));
  const [erste, zweite] = listMessages(db, "c1");
  expect(erste.parentId).toBeUndefined();
  expect(zweite).toMatchObject({ parentId: "c1", authorAvatar: "https://x/a.jpg" });
});
