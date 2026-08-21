import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";

const { deleteComment, blockAuthor, blockHint, setLike, likeHint } = await import("./inbox-moderate");

function stub(handler: (url: URL, init?: RequestInit) => unknown) {
  const calls: { url: URL; method: string }[] = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.searchParams.get("fields") === "access_token")
      return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
    return new Response(JSON.stringify(handler(url, init)));
  }) as typeof fetch;
  return calls;
}

// Eigene Seiten-Id: pageToken() merkt sich Tokens im Modul, und bun test teilt
// sich einen Prozess über alle Dateien – "page_1" ist anderswo schon belegt.
const comment = { kind: "comment", channel: "facebook", selfId: "mod_page", threadId: "c1", authorId: "u1" } as const;

test("einen Kommentar löschen geht als DELETE auf die Kommentar-Id, mit dem Seiten-Token", async () => {
  const calls = stub(() => ({ success: true }));
  await deleteComment(comment);

  const del = calls.find((c) => c.method === "DELETE")!;
  expect(del.url.pathname).toEndWith("/c1");
  expect(del.url.searchParams.get("access_token")).toBe("PAGE_TOKEN");
});

test("eine Nachricht lässt sich nicht löschen", async () => {
  stub(() => ({ success: true }));
  expect(deleteComment({ ...comment, kind: "dm" })).rejects.toThrow("nur Kommentare");
});

test("blockieren schreibt die Person auf die blocked-Edge der Seite", async () => {
  const calls = stub(() => ({ u1: true }));
  await blockAuthor(comment);

  const post = calls.find((c) => c.method === "POST")!;
  expect(post.url.pathname).toEndWith("/mod_page/blocked");
  expect(post.url.searchParams.get("user_ids")).toBe('["u1"]');
});

test("ein abgelehntes Blockieren gilt nicht als Erfolg, obwohl Meta mit 200 antwortet", async () => {
  stub(() => ({ u1: false }));
  expect(blockAuthor(comment)).rejects.toThrow("abgelehnt");
});

test("für Instagram wird gar nicht erst gefragt – die Schnittstelle gibt es nicht", async () => {
  const calls = stub(() => ({}));
  expect(blockAuthor({ ...comment, channel: "instagram" })).rejects.toThrow("Instagram-App");
  expect(blockHint("instagram")).toBeDefined();
  expect(blockHint("facebook")).toBeUndefined();
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
});

test("ein Facebook-Kommentar wird über seine likes-Edge geliked und wieder entliked", async () => {
  const calls = stub(() => ({ success: true }));
  await setLike(comment, "c1", true);
  await setLike(comment, "c1", false);

  const likes = calls.filter((c) => c.url.pathname.endsWith("/c1/likes"));
  expect(likes.map((c) => c.method)).toEqual(["POST", "DELETE"]);
});

test("eine Instagram-DM bekommt eine Reaktion auf die einzelne Nachricht", async () => {
  const calls = stub(() => ({ success: true }));
  await setLike({ ...comment, kind: "dm", channel: "instagram" }, "m9", true);

  const post = calls.find((c) => c.method === "POST")!;
  expect(post.url.pathname).toEndWith("/mod_page/messages");
  expect(post.url.searchParams.get("sender_action")).toBe("react");
  expect(JSON.parse(post.url.searchParams.get("payload")!)).toEqual({ message_id: "m9", reaction: "love" });
});

test("die beiden Lücken bei Meta werden benannt, nicht stillschweigend versucht", async () => {
  const calls = stub(() => ({}));
  expect(likeHint("comment", "instagram")).toContain("Instagram-App");
  expect(likeHint("dm", "facebook")).toContain("Messenger");
  expect(likeHint("comment", "facebook")).toBeUndefined();
  expect(likeHint("dm", "instagram")).toBeUndefined();
  expect(setLike({ ...comment, channel: "instagram" }, "ic1", true)).rejects.toThrow("Instagram-App");
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
});
