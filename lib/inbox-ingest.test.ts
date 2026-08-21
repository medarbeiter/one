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
