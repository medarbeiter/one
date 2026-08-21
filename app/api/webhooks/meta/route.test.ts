import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
process.env.META_APP_SECRET = "app-secret";
process.env.META_ACCESS_TOKEN = "TEST";

const { GET, POST } = await import("./route");

test("GET beantwortet Metas Challenge nur mit dem richtigen Verify-Token", async () => {
  const ok = await GET(new Request("https://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123"));
  expect(await ok.text()).toBe("123");
  expect(ok.status).toBe(200);

  const wrong = await GET(new Request("https://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=falsch&hub.challenge=123"));
  expect(wrong.status).toBe(403);
});

function signed(body: string, secret = "app-secret") {
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://x/api/webhooks/meta", { method: "POST", body, headers: { "x-hub-signature-256": sig } });
}

test("POST ohne gültige Signatur wird abgelehnt, ohne den Body zu verarbeiten", async () => {
  const res = await POST(new Request("https://x/api/webhooks/meta", { method: "POST", body: JSON.stringify({ entry: [] }), headers: { "x-hub-signature-256": "sha256=falsch" } }));
  expect(res.status).toBe(403);
});

test("POST mit gültiger Signatur und leeren Einträgen antwortet 200", async () => {
  const res = await POST(signed(JSON.stringify({ object: "page", entry: [] })));
  expect(res.status).toBe(200);
});
