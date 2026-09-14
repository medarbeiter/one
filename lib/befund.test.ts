import { expect, test } from "bun:test";
import { befunde, befundeAlle, median, stufe, tage, umfeld } from "./befund";
import type { Campaign } from "./campaigns";

const lead = (n: number) => [{ action_type: "lead", value: String(n) }];
const camp = (id: string, i: Record<string, unknown>, extra: Partial<Campaign> = {}): Campaign => ({
  id,
  name: id,
  status: "ACTIVE",
  objective: "OUTCOME_LEADS",
  daily_budget: "2000",
  insights: { last_7d: i as any },
  ...extra,
});

test("tage: feste Zeiträume, Gesamt seit Start", () => {
  expect(tage("today")).toBe(1);
  expect(tage("last_7d")).toBe(7);
  const jetzt = Date.parse("2026-09-14T12:00:00Z");
  expect(tage("maximum", "2026-09-04T12:00:00Z", jetzt)).toBe(10);
  expect(tage("maximum", undefined, jetzt)).toBe(30);
});

test("median", () => {
  expect(median([])).toBeUndefined();
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 2, 3])).toBe(2.5);
});

test("pausierte Kampagnen bekommen kein Urteil", () => {
  const c = camp("p", { spend: "100" }, { status: "PAUSED" });
  expect(befunde(c, "last_7d")).toEqual([]);
  expect(stufe(c, [])).toBeUndefined();
});

test("Geld ohne Leads ist rot; schwache CTR nennt das Creative", () => {
  const b = befunde(camp("a", { spend: "150", impressions: "5000", inline_link_click_ctr: "0.4" }), "last_7d");
  const rot = b.find((x) => x.titel === "Keine Leads")!;
  expect(rot.stufe).toBe("rot");
  expect(rot.tipp).toContain("CTR");
  // Kein zweiter Creative-Befund neben dem roten.
  expect(b.some((x) => x.titel === "Creative zieht nicht")).toBe(false);
});

test("Klicks ohne Formular-Abschluss zeigt aufs Formular", () => {
  const b = befunde(camp("a", { spend: "150", impressions: "5000", inline_link_click_ctr: "2.5" }), "last_7d");
  expect(b.find((x) => x.titel === "Keine Leads")!.tipp).toContain("Formular");
});

test("Anlaufen ist kein Befund: unter zwei Tagesbudgets kein Rot", () => {
  const b = befunde(camp("a", { spend: "30" }), "last_7d");
  expect(b.some((x) => x.stufe === "rot")).toBe(false);
});

test("teurer als der Median der Liste, erst ab drei Vergleichskampagnen", () => {
  const peers = [
    camp("1", { spend: "100", actions: lead(10) }),
    camp("2", { spend: "100", actions: lead(10) }),
    camp("3", { spend: "100", actions: lead(10) }),
    camp("x", { spend: "100", actions: lead(2) }),
  ];
  expect(umfeld(peers, "last_7d").cpl).toBe(10);
  const alle = befundeAlle(peers, "last_7d");
  expect(alle.get("x")!.map((b) => b.titel)).toContain("Teurer als der Schnitt");
  expect(alle.get("1")).toEqual([]);
  expect(umfeld(peers.slice(0, 2), "last_7d").cpl).toBeUndefined();
});

test("Frequenz, Nichtauslieferung, Trend", () => {
  const c = camp("a", { spend: "20", frequency: "3.6", actions: lead(3) });
  c.insights!.last_30d = { spend: "300", actions: lead(30) } as any;
  c.insights!.last_7d = { ...c.insights!.last_7d, spend: "60" } as any;
  const titel = befunde(c, "last_7d").map((b) => b.titel);
  expect(titel).toContain("Zielgruppe müde");
  expect(titel).toContain("Liefert nicht aus");
  expect(titel).toContain("Wird teurer");
  expect(stufe(c, befunde(c, "last_7d"))).toBe("gelb");
});

test("Heute: keine Auslieferungs-Befunde", () => {
  const c = camp("a", {}, { insights: { today: {} } });
  expect(befunde(c, "today")).toEqual([]);
  expect(stufe(c, [])).toBe("ok");
});
