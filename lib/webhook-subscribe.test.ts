import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
const { ensureWebhookSubscribed } = await import("./webhook-subscribe");

test("jede Seite bekommt genau einen Abonnements-Aufruf mit feed und messages", async () => {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.includes("/page_2")) return new Response(JSON.stringify({ error: { code: 200, message: "no perm" } }), { status: 403 });
    if (url.searchParams.has("fields")) return new Response(JSON.stringify({ access_token: "page_token_1" }));
    return new Response(JSON.stringify({ success: true }));
  }) as typeof fetch;

  const result = await ensureWebhookSubscribed([{ id: "page_1", name: "ACME" }, { id: "page_2", name: "Broken" }]);
  expect(result.subscribed.map((p) => p.id)).toEqual(["page_1"]);
  expect(result.failed).toEqual([{ id: "page_2", name: "Broken", message: expect.stringContaining("no perm") }]);
  const subCall = calls.find((c) => c.searchParams.has("subscribed_fields"));
  expect(subCall?.searchParams.get("subscribed_fields")).toBe("feed,messages");
});
