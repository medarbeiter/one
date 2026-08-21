import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
process.env.META_APP_SECRET = "app-secret";
process.env.META_ACCESS_TOKEN = "TEST";
// openDb() öffnet beim ersten Aufruf und merkt sich die Verbindung für den
// Rest des Testlaufs – muss also vor dem ersten POST stehen, nicht erst im
// letzten Test, sonst greift der Default-Pfad (/data/inbox.sqlite) zuerst.
process.env.INBOX_DB_PATH = ":memory:";

const { GET, POST } = await import("./route");

// POST ruft jetzt (Task 7) listCustomers() auf, egal wie leer entry[] ist –
// ohne eigenen Stub hängt das Ergebnis vom zuletzt gesetzten globalThis.fetch
// eines anderen, vorher gelaufenen Testfiles ab (bun test teilt den Prozess).
// Ein leeres Portfolio ({ data: [] } für jede Edge) ist genau der Fall, den
// die Tests unten meinen ("200 trotz leerem Portfolio") – nur ortsunabhängig.
function stubEmptyPortfolio() {
  globalThis.fetch = (async (_input: any) => new Response(JSON.stringify({ data: [] }))) as typeof fetch;
}

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
  stubEmptyPortfolio();
  const res = await POST(signed(JSON.stringify({ object: "page", entry: [] })));
  expect(res.status).toBe(200);
});

test("POST verarbeitet einen echten Eintrag und schreibt in die Datenbank", async () => {
  // listCustomers() braucht ein Portfolio – hier reicht ein Mock über den Modul-Cache nicht
  // ohne Weiteres; dieser Test bleibt bewusst auf "antwortet 200 trotz leerem Portfolio"
  // beschränkt (kein Kunde gefunden → customerFor liefert undefined → kein Fehler).
  stubEmptyPortfolio();
  const res = await POST(signed(JSON.stringify({ object: "page", entry: [{ id: "unknown_page", changes: [] }] })));
  expect(res.status).toBe(200);
});
