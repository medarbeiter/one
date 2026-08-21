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
