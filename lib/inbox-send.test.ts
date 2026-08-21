import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
const { sendReply } = await import("./inbox-send");
const { GraphError } = await import("./graph");

function stub(handler: (url: URL) => unknown) {
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/self_1") && !url.searchParams.has("message")) return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
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
