import { beforeEach, expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";

const { igAvatars, dmAvatars, resetAvatarState } = await import("./avatars");
const { resetScrapeState } = await import("./ig-scrape");

/**
 * Ein Meta-Ersatz, der zählt, wonach gefragt wurde: die Reihenfolge der Wege
 * ist hier die eigentliche Logik, nicht das einzelne Ergebnis.
 */
function stub(antwort: (relativeUrl: string) => { code: number; body: unknown }) {
  const gefragt: string[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(String(input));
    if (url.hostname === "www.instagram.com") {
      gefragt.push(`scrape:${url.searchParams.get("username")}`);
      const r = antwort(`scrape:${url.searchParams.get("username")}`);
      return new Response(JSON.stringify(r.body), { status: r.code });
    }
    if (init?.method === "POST") {
      const reqs = JSON.parse(url.searchParams.get("batch")!) as { relative_url: string }[];
      return new Response(
        JSON.stringify(
          reqs.map((r) => {
            gefragt.push(r.relative_url);
            const a = antwort(r.relative_url);
            return { code: a.code, body: JSON.stringify(a.body) };
          }),
        ),
      );
    }
    return new Response(JSON.stringify({ access_token: "PAGE_TOKEN" }));
  }) as typeof fetch;
  return gefragt;
}

const ctx = { pageId: "page_1", igUserId: "ig_1" };
// So sagt Meta "keine Freigabe" bei Messenger: Code 100, kein Wort von Rechten
// im Code – nur in der Meldung.
const verboten = {
  error: { code: 100, error_subcode: 33, message: "Unsupported get request. Object with ID '…' does not exist, cannot be loaded due to missing permissions, or does not support this operation." },
};

beforeEach(() => {
  resetAvatarState();
  resetScrapeState();
  delete process.env.IG_SCRAPE_AVATARS;
});

test("Instagram: business_discovery zuerst, dann die Profil-Route, dann der Direktweg", async () => {
  process.env.IG_SCRAPE_AVATARS = "1";
  const gefragt = stub((u) => {
    if (u.includes("business_discovery.username(firma")) return { code: 200, body: { business_discovery: { profile_picture_url: "https://x/firma.jpg" } } };
    if (u.includes("business_discovery")) return { code: 400, body: { error: { code: 110, message: "kein Unternehmenskonto" } } };
    if (u === "u_privat?fields=profile_pic") return { code: 200, body: { profile_pic: "https://x/privat.jpg" } };
    if (u.startsWith("scrape:")) return { code: 200, body: { data: { user: { profile_pic_url_hd: "https://x/rest.jpg" } } } };
    return { code: 200, body: {} };
  });

  const bilder = await igAvatars(
    ctx,
    [
      { id: "u_firma", username: "firma" },
      { id: "u_privat", username: "privat" },
      { id: "u_rest", username: "rest" },
    ],
    [],
  );

  expect(bilder.get("firma")).toBe("https://x/firma.jpg");
  expect(bilder.get("privat")).toBe("https://x/privat.jpg");
  expect(bilder.get("rest")).toBe("https://x/rest.jpg");
  // Wer schon ein Bild hat, wird nicht noch einmal gesucht.
  expect(gefragt.filter((u) => u.startsWith("u_firma"))).toHaveLength(0);
  expect(gefragt).not.toContain("scrape:privat");
});

test("ohne IG_SCRAPE_AVATARS bleibt der Direktweg aus", async () => {
  const gefragt = stub((u) =>
    u.includes("business_discovery") ? { code: 400, body: { error: { code: 110, message: "nein" } } } : { code: 200, body: {} },
  );

  const bilder = await igAvatars(ctx, [{ id: "u1", username: "privat" }], []);

  expect(bilder.size).toBe(0);
  expect(gefragt.some((u) => u.startsWith("scrape:"))).toBe(false);
});

test("eine fehlende Freigabe wird einmal gemeldet und danach nicht mehr gefragt", async () => {
  const gefragt = stub(() => ({ code: 403, body: verboten }));
  const failures: string[] = [];

  const erste = await dmAvatars("page_1", ["psid_1", "psid_2"], failures);
  const zweite = await dmAvatars("page_1", ["psid_3"], failures);

  expect(erste.size + zweite.size).toBe(0);
  expect(failures).toHaveLength(1);
  expect(failures[0]).toContain("missing permissions");
  // Zwei Ids im ersten Anlauf, danach gar nichts mehr.
  expect(gefragt).toEqual(["psid_1?fields=profile_pic", "psid_2?fields=profile_pic"]);
});

test("ein gefundenes Bild wird gemerkt, nicht bei jedem Abgleich neu geholt", async () => {
  const gefragt = stub(() => ({ code: 200, body: { profile_pic: "https://x/a.jpg" } }));

  await dmAvatars("page_1", ["psid_1"], []);
  const zweite = await dmAvatars("page_1", ["psid_1"], []);

  expect(zweite.get("psid_1")).toBe("https://x/a.jpg");
  expect(gefragt).toHaveLength(1);
});

test("Instagram sperrt den Direktweg aus – dann fragt niemand weiter", async () => {
  process.env.IG_SCRAPE_AVATARS = "1";
  const gefragt = stub((u) =>
    u.startsWith("scrape:")
      ? { code: 429, body: {} }
      : { code: 400, body: { error: { code: 110, message: "nein" } } },
  );

  await igAvatars(ctx, [{ id: "u1", username: "eins" }], []);
  await igAvatars(ctx, [{ id: "u2", username: "zwei" }], []);

  expect(gefragt.filter((u) => u.startsWith("scrape:"))).toEqual(["scrape:eins"]);
});
