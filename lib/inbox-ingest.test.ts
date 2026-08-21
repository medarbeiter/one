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
                  from: { id: "u1", name: "Anna", picture: { data: { url: "https://x/anna.jpg" } } },
                  comments: {
                    data: [
                      {
                        id: "r1",
                        message: "Schreib uns eine PN!",
                        created_time: "2026-08-20T09:05:00+0000",
                        from: { id: "page_1", name: "ACME" },
                        parent: { id: "c1" },
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
  expect(messages[0]).toMatchObject({ authorAvatar: "https://x/anna.jpg", parentId: undefined });
  expect(messages[1]).toMatchObject({ text: "Schreib uns eine PN!", fromSelf: true, parentId: "c1" });
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

const { fetchInstagramSource, reconcile } = await import("./inbox-ingest");

test("Instagram: Kommentare kommen über die comments-Edge – mit from.id, parent_id und Bild", async () => {
  const gefragt: string[] = [];
  stub((url) => {
    if (url.pathname.includes("/media")) {
      return {
        data: [
          {
            id: "media_1",
            caption: "New opening in Dresden",
            media_url: "https://x/photo.jpg",
            // Als Unterfeld gibt Meta nur die Id her – der Rest kommt aus dem Batch.
            comments: { data: [{ id: "ic1" }] },
          },
        ],
      };
    }
    const batch = url.searchParams.get("batch");
    if (batch) {
      return JSON.parse(batch).map((r: { relative_url: string }) => {
        gefragt.push(r.relative_url);
        if (r.relative_url.includes("/comments"))
          return {
            code: 200,
            body: JSON.stringify({
              data: [
                {
                  id: "ic1",
                  text: "Interessiert!",
                  timestamp: "2026-08-20T09:00:00+0000",
                  from: { id: "iu1", username: "anna_k" },
                  replies: {
                    data: [
                      {
                        id: "ir1",
                        text: "Melde dich gern!",
                        timestamp: "2026-08-20T09:05:00+0000",
                        from: { id: "ig_1", username: "acme_pflege" },
                        parent_id: "ic1",
                      },
                    ],
                  },
                },
              ],
            }),
          };
        // business_discovery: für ein Unternehmenskonto ein Bild, für alles
        // andere ein Fehler – der nur diesen einen Nutzer kostet.
        if (r.relative_url.includes("anna_k"))
          return { code: 200, body: JSON.stringify({ business_discovery: { profile_picture_url: "https://x/anna.jpg" } }) };
        return { code: 400, body: JSON.stringify({ error: { code: 110, message: "kein Unternehmenskonto" } }) };
      });
    }
    return { data: [] }; // conversations
  });

  const { source, messages } = await fetchInstagramSource(
    { id: "acme", name: "ACME" } as any,
    { id: "page_1", instagram: { id: "ig_1" } } as any,
    "2026-05-23T00:00:00.000Z",
  );

  expect(gefragt[0]).toContain("media_1/comments");
  expect(source.posts[0]).toMatchObject({ message: "New opening in Dresden", full_picture: "https://x/photo.jpg" });
  expect(source.posts[0].comments?.data[0]).toMatchObject({ id: "ic1", message: "Interessiert!" });
  // Ohne selfAuthorId hielte normalize() die eigene Antwort für die eines Fremden.
  expect(source.selfAuthorId).toBe("ig_1");
  expect(messages[0]).toMatchObject({ id: "ic1", authorName: "anna_k", authorAvatar: "https://x/anna.jpg", fromSelf: false });
  expect(messages[1]).toMatchObject({ id: "ir1", fromSelf: true, parentId: "ic1", authorAvatar: undefined });
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

test("eine gesperrte IG-DM-Edge (#200) kostet nur die Direktnachrichten, nicht die Beiträge des Kunden", async () => {
  const { Database } = await import("bun:sqlite");
  const { initSchema, listThreads } = await import("./inbox-store");
  const db = new Database(":memory:");
  initSchema(db);

  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/conversations") && url.searchParams.get("platform") === "instagram")
      return new Response(
        JSON.stringify({ error: { code: 200, message: "(#200) The owner of this account has restricted access to Instagram Direct Messages" } }),
        { status: 403 },
      );
    if (!url.pathname.includes("/posts") && !url.pathname.includes("/conversations") && !url.pathname.includes("/media"))
      return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
    if (url.pathname.includes("/posts"))
      return new Response(JSON.stringify({
        data: [{ id: "post_1", message: "Hi", comments: { data: [{ id: "c1", message: "Hallo", created_time: "2026-08-20T09:00:00+0000", from: { id: "u1", name: "Anna" } }] } }],
      }));
    return new Response(JSON.stringify({ data: [] }));
  }) as typeof fetch;

  const result = await reconcile(db, [
    { id: "ebert", name: "Ebert", page: { id: "page_1" }, instagram: { id: "ig_1" } } as any,
  ]);

  expect(result.failed).toHaveLength(1);
  expect(result.failed[0].message).toContain("Instagram Direct Messages");
  expect(listThreads(db, {}).map((t) => t.id)).toEqual(["c1"]); // der Kommentar ist trotzdem da
});

test("eine dauerhaft zu Edge wird nach dem ersten Fehlschlag nicht erneut erfragt, bleibt aber gemeldet", async () => {
  const { Database } = await import("bun:sqlite");
  const db = new Database(":memory:");
  (await import("./inbox-store")).initSchema(db);

  let dmCalls = 0;
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/conversations") && url.searchParams.get("platform") === "instagram") {
      dmCalls++;
      return new Response(
        JSON.stringify({ error: { code: 1, is_transient: true, error_user_msg: "Deine Anfrage ist abgelaufen … beantrage erweiterten Zugriff auf die Berechtigung instagram_manage_messages …" } }),
        { status: 400 },
      );
    }
    if (!url.pathname.includes("/posts") && !url.pathname.includes("/conversations") && !url.pathname.includes("/media"))
      return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
    return new Response(JSON.stringify({ data: [] }));
  }) as typeof fetch;

  const customers = [{ id: "muldental", name: "Muldental", page: { id: "page_9" }, instagram: { id: "ig_9" } } as any];
  const first = await reconcile(db, customers);
  const second = await reconcile(db, customers);

  expect(dmCalls).toBe(1); // kein zweiter Anlauf, auch nicht der Retry in graph()
  expect(second.failed[0].message).toContain("instagram_manage_messages");
  expect(first.failed).toEqual(second.failed);
});

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
