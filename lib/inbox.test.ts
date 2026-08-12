/**
 * Der Normalizer ist die riskanteste Stelle der App: vier Graph-Formen,
 * eine Ausgabe. Und die 24-Stunden-Grenze, an der stumme Fehler Antworten kosten.
 */
import { expect, test } from "bun:test";
import { attachAds, expiresAt, isExpired, normalize, type Source } from "./inbox";

const SELF = "page_1";

const source = (over: Partial<Source> = {}): Source => ({
  customerId: "acme",
  channel: "facebook",
  selfId: SELF,
  posts: [],
  conversations: [],
  ...over,
});

test("Kommentare werden zu Items, mit Beitrag als Kontext", () => {
  const [item] = normalize([
    source({
      posts: [
        {
          id: "post_1",
          message: "We are hiring carers in Dresden",
          full_picture: "https://x/img.jpg",
          comments: {
            data: [
              {
                id: "c1",
                message: "How do I apply?",
                created_time: "2026-08-10T09:00:00+0000",
                from: { id: "u1", name: "Anna" },
              },
            ],
          },
        },
      ],
    }),
  ]);

  expect(item).toMatchObject({
    id: "c1",
    kind: "comment",
    channel: "facebook",
    customerId: "acme",
    text: "How do I apply?",
    answered: false,
  });
  expect(item.author.name).toBe("Anna");
  expect(item.context?.thumbnail).toBe("https://x/img.jpg");
  expect(item.context?.label).toContain("hiring carers");
  // Kommentare haben kein Zeitfenster – nur DMs.
  expect(item.expiresAt).toBeUndefined();
});

test("Beantwortet heißt: wir haben in diesem Thread geschrieben", () => {
  const withReply = normalize([
    source({
      posts: [
        {
          id: "p",
          comments: {
            data: [
              {
                id: "c1",
                message: "Hi",
                created_time: "2026-08-10T09:00:00+0000",
                from: { id: "u1", name: "Anna" },
                comments: { data: [{ from: { id: SELF }, created_time: "2026-08-10T10:00:00+0000" }] },
              },
            ],
          },
        },
      ],
    }),
  ]);
  expect(withReply[0].answered).toBe(true);

  const foreignReply = normalize([
    source({
      posts: [
        {
          id: "p",
          comments: {
            data: [
              {
                id: "c1",
                message: "Hi",
                created_time: "2026-08-10T09:00:00+0000",
                from: { id: "u1", name: "Anna" },
                comments: { data: [{ from: { id: "u2" }, created_time: "2026-08-10T10:00:00+0000" }] },
              },
            ],
          },
        },
      ],
    }),
  ]);
  expect(foreignReply[0].answered).toBe(false);
});

test("Unterhaltungen werden zu DMs mit 24-Stunden-Fenster", () => {
  const [dm] = normalize([
    source({
      channel: "instagram",
      conversations: [
        {
          id: "t1",
          updated_time: "2026-08-10T09:00:00+0000",
          participants: { data: [{ id: SELF, name: "Us" }, { id: "u9", name: "Bea" }] },
          messages: {
            data: [
              {
                id: "m2",
                message: "Still interested?",
                created_time: "2026-08-10T09:00:00+0000",
                from: { id: "u9", name: "Bea" },
              },
            ],
          },
        },
      ],
    }),
  ]);

  expect(dm).toMatchObject({ id: "t1", kind: "dm", channel: "instagram", answered: false });
  // Der Gesprächspartner ist der, der nicht wir ist.
  expect(dm.author).toMatchObject({ id: "u9", name: "Bea" });
  expect(dm.expiresAt).toBe("2026-08-11T09:00:00.000Z");
});

test("Zuletzt von uns geschrieben heißt beantwortet", () => {
  const [dm] = normalize([
    source({
      conversations: [
        {
          id: "t1",
          updated_time: "2026-08-10T09:00:00+0000",
          participants: { data: [{ id: SELF, name: "Us" }, { id: "u9", name: "Bea" }] },
          messages: {
            data: [
              {
                id: "m3",
                message: "Sure, here you go",
                created_time: "2026-08-10T09:00:00+0000",
                from: { id: SELF, name: "Us" },
              },
            ],
          },
        },
      ],
    }),
  ]);
  expect(dm.answered).toBe(true);
});

test("Neueste zuerst, quer über alle Quellen", () => {
  const items = normalize([
    source({
      posts: [
        {
          id: "p",
          comments: {
            data: [
              { id: "old", message: "a", created_time: "2026-08-09T09:00:00+0000", from: { id: "u1", name: "A" } },
              { id: "new", message: "b", created_time: "2026-08-11T09:00:00+0000", from: { id: "u2", name: "B" } },
            ],
          },
        },
      ],
    }),
  ]);
  expect(items.map((i) => i.id)).toEqual(["new", "old"]);
});

test("Die 24-Stunden-Grenze wird an genau der Grenze richtig gezogen", () => {
  const created = "2026-08-10T09:00:00+0000";
  const at = Date.parse(expiresAt(created));
  const dm = { expiresAt: expiresAt(created) } as any;

  expect(isExpired(dm, at - 60_000)).toBe(false); // 23:59
  expect(isExpired(dm, at)).toBe(true); // exakt 24:00
  expect(isExpired(dm, at + 60_000)).toBe(true); // 24:01
  // Kommentare laufen nie ab.
  expect(isExpired({ expiresAt: undefined } as any, Date.now())).toBe(false);
});

test("Kommentare bekommen die Anzeige, unter der sie stehen", () => {
  const items = [
    { id: "c1", kind: "comment", context: { label: "Post" }, postId: "p1" },
    { id: "c2", kind: "comment", context: { label: "Post" }, postId: "p9" },
    { id: "t1", kind: "dm" },
  ] as any[];

  const out = attachAds(items, new Map([["p1", { adId: "ad_1", name: "Carers – variant B" }]]));
  expect(out[0].context).toMatchObject({ adId: "ad_1", label: "Carers – variant B" });
  // Ohne Treffer bleibt der Beitragstext stehen, statt "unbekannt" zu behaupten.
  expect(out[1].context).toMatchObject({ label: "Post" });
  expect(out[1].context?.adId).toBeUndefined();
  expect(out[2].context).toBeUndefined();
});
