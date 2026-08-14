/**
 * Die Kunden kommen aus dem Portfolio; hier steht, was ein Mensch daran
 * festsetzt – und was passiert, wenn seine Entscheidung ins Leere zeigt.
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
process.env.META_BUSINESS_ID = "biz";
const {
  applyOverrides,
  payers,
  clients,
  resolveClientByName,
  fuzzyCustomerMatch,
  instagramAccountLabel,
  listAssets,
  needsLeadgenTos,
} = await import("./customers");

const acc = (id: string, access: "own" | "client" = "client") => ({
  id,
  name: id,
  account_status: 1,
  currency: "EUR",
  access,
});
const page = (id: string, access: "own" | "client" = "client") => ({ id, name: id, access });

const customer = (source: string, id: string, name = id) => ({
  source,
  id,
  name,
  adAccounts: [],
  access: "client" as const,
  issues: [],
});

test("ein Override setzt Id und Name fest", () => {
  const { customers } = applyOverrides(
    [customer("p1", "caritasaltenpflegeheimstmichaeldresden")],
    { p1: { id: "caritasstmichael", name: "Caritas St. Michael" } },
    [],
  );
  expect(customers[0].id).toBe("caritasstmichael");
  expect(customers[0].name).toBe("Caritas St. Michael");
});

test("ein Override ersetzt die Werbekonten vollständig", () => {
  const { customers } = applyOverrides(
    [{ ...customer("p1", "kunde"), adAccounts: [acc("act_1")] }],
    { p1: { adAccountIds: ["2"] } },
    [acc("act_1"), acc("act_2")],
  );
  // "2" ohne Präfix muss dasselbe Konto treffen wie "act_2".
  expect(customers[0].adAccounts.map((a) => a.id)).toEqual(["act_2"]);
});

test("hidden entfernt den Kunden", () => {
  const { customers } = applyOverrides([customer("p1", "kunde")], { p1: { hidden: true } }, []);
  expect(customers).toEqual([]);
});

test("ein Override ins Leere wird gemeldet statt still ignoriert", () => {
  // Genau so alterte die erzeugte Config: sie zeigte auf Seiten, die es nicht
  // mehr gab, und niemand erfuhr davon.
  const { issues } = applyOverrides([customer("p1", "kunde")], { p9: { id: "x" } }, []);
  expect(issues).toEqual(["Override p9 gehört zu keinem Asset im Portfolio"]);
});

test("ein Override auf ein unbekanntes Werbekonto wird gemeldet", () => {
  const { issues } = applyOverrides([customer("p1", "kunde")], { p1: { adAccountIds: ["9"] } }, []);
  expect(issues).toEqual(["Werbekonto act_9 (Override p1) ist nicht im Portfolio"]);
});

test("eine festgesetzte Id verdrängt die abgeleitete gleiche", () => {
  const { customers } = applyOverrides(
    [customer("p1", "kunde"), customer("p2", "anders")],
    { p2: { id: "kunde" } },
    [],
  );
  expect(customers.find((c) => c.source === "p2")!.id).toBe("kunde");
  expect(customers.find((c) => c.source === "p1")!.id).toBe("kunde-2");
});

test("Instagram wird mit Nutzername statt numerischer ID beschriftet", () => {
  expect(
    instagramAccountLabel({ id: "17841423573676293", username: "janinespflegeteam" }),
  ).toBe("@janinespflegeteam");
  expect(instagramAccountLabel({ id: "17841423573676293" })).toBe(
    "Instagram-ID 17841423573676293",
  );
  expect(instagramAccountLabel(undefined)).toBeUndefined();
});

/**
 * Der Kern der Trennung: MedArbeiter zahlt, die Seite des Kunden veröffentlicht.
 * Vorher musste ein Kunde beides haben, um überhaupt zu erscheinen – deshalb
 * lief alles auf MedArbeiters eigener Seite statt auf der des Kunden.
 */
test("Zahler und beworbener Kunde sind zwei getrennte Listen", () => {
  const all = [
    // MedArbeiter zahlt für alle – eigene Seite unwichtig.
    { ...customer("p_med", "medarbeiter", "MedArbeiter"), page: page("p_med"), adAccounts: [acc("act_1")] },
    // Der typische Kunde: eine Seite, kein eigenes Werbekonto.
    { ...customer("p_herz", "herzhalt", "Herzhalt Pflegedienst"), page: page("p_herz") },
  ];

  expect(payers(all).map((c) => c.id)).toEqual(["medarbeiter"]);
  // Entscheidend: Herzhalt ist wählbar, obwohl es kein Werbekonto hat.
  expect(clients(all).map((c) => c.id)).toEqual(["medarbeiter", "herzhalt"]);
});

test("MedArbeiter steht bei den zahlenden Konten immer zuerst", () => {
  const all = [
    { ...customer("p_funke", "funke", "Pflegedienst Funke"), adAccounts: [acc("act_2")] },
    { ...customer("p_med", "medarbeiter", "MedArbeiter"), adAccounts: [acc("act_1")] },
  ];

  expect(payers(all).map((c) => c.id)).toEqual(["medarbeiter", "funke"]);
});

test("die Kundensuche findet Teilbegriffe, Tipp-Auslassungen und Umlaute", () => {
  expect(fuzzyCustomerMatch("Herzhalt Pflegedienst", "herz pfle")).toBeTrue();
  expect(fuzzyCustomerMatch("Herzhalt Pflegedienst", "hrzhlt")).toBeTrue();
  expect(fuzzyCustomerMatch("Pflegedienst Schäkel", "schakel")).toBeTrue();
});

test("die Kundensuche lässt unpassende Treffer weg", () => {
  expect(fuzzyCustomerMatch("Pflegedienst Weber", "herzhalt")).toBeFalse();
});

test("Der beworbene Kunde wird über seinen Namen aufgelöst", () => {
  const list = [
    { id: "herzhalt", name: "Herzhalt Pflegedienst" },
    { id: "weber", name: "Pflegedienst Weber" },
  ];

  expect(resolveClientByName(list, "Herzhalt Pflegedienst")?.id).toBe("herzhalt");
  // Groß-/Kleinschreibung und Leerraum kommen beim Tippen mit, sind aber
  // nicht gemeint.
  expect(resolveClientByName(list, "  herzhalt pflegedienst ")?.id).toBe("herzhalt");
  // Freitext für einen Kunden, der nicht in der Config steht: keine Seite.
  expect(resolveClientByName(list, "Irgendein Pflegedienst")).toBeUndefined();
  expect(resolveClientByName(list, "   ")).toBeUndefined();
});

test("Mehrdeutige Namen liefern keine Seite statt der falschen", () => {
  const twins = [
    { id: "a", name: "Pflegedienst Nord" },
    { id: "b", name: "Pflegedienst Nord" },
  ];
  // Lieber sichtbar leer als still die Anzeige unter fremdem Namen ausspielen.
  expect(resolveClientByName(twins, "Pflegedienst Nord")).toBeUndefined();
});

test("Seiten werden mit ihren verknüpften Assets gelesen", async () => {
  // Der Feld-String ist der stille Einzelpunkt dieser Prüfung: fehlt eines der
  // Felder darin, kommt für jede Seite undefined zurück. Dann blockt entweder
  // das Lead-Gate nie oder ein tatsächlich verknüpftes Instagram-Konto fehlt.
  const original = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    asked.push(url.searchParams.get("fields") ?? "");
    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await listAssets();
  } finally {
    globalThis.fetch = original;
  }

  const pageFields = asked.filter((f) => f.includes("fan_count"));
  expect(pageFields).not.toBeEmpty();
  for (const f of pageFields) {
    expect(f).toContain("leadgen_tos_accepted");
    expect(f).toContain("instagram_business_account{id,username}");
  }
});

test("Nur ein ausdrückliches Nein blockt, ein unlesbarer Status nicht", () => {
  // Die Seiten, die dem System User nicht zugewiesen sind, kommen ohne das Feld
  // zurück. Würde undefined hier blocken, sperrte die Anwendung Kunden aus,
  // über deren Bedingungen sie nichts weiß.
  expect(needsLeadgenTos({ leadgen_tos_accepted: false })).toBe(true);
  expect(needsLeadgenTos({ leadgen_tos_accepted: true })).toBe(false);
  expect(needsLeadgenTos({})).toBe(false);
  expect(needsLeadgenTos(undefined)).toBe(false);
});
