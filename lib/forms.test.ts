/**
 * bun test – die Formular-Liste hängt am Seiten-Token, nicht am System-Token.
 * Genau daran ist sie einmal gescheitert: "(#190) This method must be called
 * with a Page Access Token".
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "SYSTEM";

const { getLeadForm, instantFormsUrl, listLeadForms, parseFormId } = await import("./forms");
const { GraphError } = await import("./graph");

test("the deep link points at the page's Instant Forms library", () => {
  const url = new URL(instantFormsUrl("337164132803732"));
  expect(url.host).toBe("business.facebook.com");
  expect(url.pathname).toBe("/latest/instant_forms");
  expect(url.searchParams.get("asset_id")).toBe("337164132803732");
});

function stub(handler: (url: URL) => { status?: number; body: unknown }) {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    calls.push(url);
    const { status = 200, body } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

// Der Tausch antwortet mit einem Seiten-Token, die Liste mit Formularen.
const happyPath = (url: URL) =>
  url.pathname.endsWith("/leadgen_forms")
    ? {
        body: {
          data: [
            { id: "1", name: "PDL Kampagne", status: "ACTIVE" },
            { id: "2", name: "Alt", status: "ARCHIVED" },
          ],
        },
      }
    : { body: { access_token: `PAGE-${url.pathname.split("/").pop()}` } };

test("die Formular-Liste läuft über das Seiten-Token, nicht das System-Token", async () => {
  const calls = stub(happyPath);

  expect(await listLeadForms("111")).toEqual([
    { id: "1", name: "PDL Kampagne", status: "ACTIVE" },
  ]);

  const [exchange, list] = calls;
  // Getauscht wird mit dem System-Token …
  expect(exchange.pathname).toBe("/v26.0/111");
  expect(exchange.searchParams.get("fields")).toBe("access_token");
  expect(exchange.searchParams.get("access_token")).toBe("SYSTEM");
  // … abgefragt wird mit dem Seiten-Token.
  expect(list.pathname).toBe("/v26.0/111/leadgen_forms");
  expect(list.searchParams.get("access_token")).toBe("PAGE-111");
});

test("das Seiten-Token wird je Seite einmal geholt, nicht je Abfrage", async () => {
  const calls = stub(happyPath);

  await listLeadForms("222");
  await listLeadForms("222");

  expect(calls.filter((u) => u.pathname === "/v26.0/222")).toHaveLength(1);
  expect(calls.filter((u) => u.pathname.endsWith("/leadgen_forms"))).toHaveLength(2);
});

test("ohne Seiten-Zuweisung sagt der Fehler, was zu tun ist", async () => {
  // Graph antwortet 200 ohne access_token, wenn der System-User die Seite nicht hat.
  stub((url) => (url.pathname.endsWith("/leadgen_forms") ? { body: { data: [] } } : { body: { id: "333" } }));

  const err = await listLeadForms("333").catch((e) => e);
  expect(err).toBeInstanceOf(GraphError);
  expect(err.kind).toBe("permission");
  expect(err.message).toContain("333");
});

// Der Aktualisieren-Knopf hing am Datei-Cache: gecacht mit revalidate 60 kam
// bis zu eine Minute lang genau die Liste zurück, wegen der geklickt wurde.
test("die Liste wird gecacht, der Aktualisieren-Weg holt ungecacht", async () => {
  const inits: (RequestInit | undefined)[] = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/leadgen_forms")) inits.push(init);
    return new Response(JSON.stringify(url.pathname.endsWith("/leadgen_forms") ? { data: [] } : { access_token: "PAGE" }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await listLeadForms("555");
  await listLeadForms("555", true);

  const [cached, fresh] = inits as any[];
  expect(cached.next).toEqual({ revalidate: 60, tags: ["forms", "forms:555"] });
  expect(fresh.next).toBeUndefined();
  expect(fresh.cache).toBe("no-store");
});

test("ein einzelnes Formular kommt über das Seiten-Token der eigenen Seite", async () => {
  const calls = stub((url) =>
    url.pathname === "/v26.0/999"
      ? { body: { id: "999", name: "Direkt geholt", status: "ACTIVE" } }
      : { body: { access_token: "PAGE-666" } },
  );

  expect(await getLeadForm("666", "999")).toEqual({
    id: "999",
    name: "Direkt geholt",
    status: "ACTIVE",
  });
  // Die fremde Seite scheitert damit an Graph, nicht erst beim Anlegen.
  expect(calls.at(-1)!.searchParams.get("access_token")).toBe("PAGE-666");
});

test("die Formular-ID wird aus Kopiertem gelesen, aber nicht geraten", () => {
  expect(parseFormId(" 1234567890123456 ")).toBe("1234567890123456");
  expect(
    parseFormId("https://business.facebook.com/latest/instant_forms?asset_id=111&form_id=222"),
  ).toBe("222");
  // Zwei Zahlenketten ohne Namen: lieber nachfragen als die Seite bewerben.
  expect(parseFormId("111222333444 999888777666")).toBeUndefined();
  expect(parseFormId("PDL Kampagne")).toBeUndefined();
});

test("ein fehlgeschlagener Tausch wird nicht eingebrannt", async () => {
  let fail = true;
  const calls = stub((url) => {
    if (url.pathname.endsWith("/leadgen_forms")) return { body: { data: [] } };
    return fail ? { status: 400, body: { error: { code: 100, message: "nope" } } } : { body: { access_token: "PAGE-444" } };
  });

  await listLeadForms("444").catch(() => {});
  fail = false;
  await listLeadForms("444");

  expect(calls.filter((u) => u.pathname === "/v26.0/444")).toHaveLength(2);
  expect(calls.at(-1)!.searchParams.get("access_token")).toBe("PAGE-444");
});
