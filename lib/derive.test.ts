/**
 * Zwei Aufgaben, zwei Funktionen: matchKey ordnet Werbekonten zu und wirft dafür
 * Rechtsformen weg, customerId benennt den Kunden und behält seinen Namen.
 */
import { expect, test } from "bun:test";
import { customerId, dedupeIds, matchAdAccounts, matchKey, normalise } from "./derive";

const acc = (name: string) => ({
  id: `act_${name}`,
  name,
  account_status: 1,
  currency: "EUR",
  access: "client" as const,
});

test("Umlaute und ß überleben die Normalisierung als Buchstaben", () => {
  expect(normalise("Pflegedienst Schröter")).toBe("pflegedienst schroter");
  expect(normalise("Straße")).toBe("strasse");
});

test("die Id behält den Namen, der Abgleichsschlüssel wirft Rechtsformen weg", () => {
  expect(customerId("Ambulanter Pflegedienst Schröter")).toBe("ambulanterpflegedienstschroter");
  // "ambulanter" und "pflegedienst" stehen beide in NOISE.
  expect(matchKey("Ambulanter Pflegedienst Schröter")).toBe("schroter");
});

test("die Id wird bei 48 Zeichen gekappt", () => {
  expect(customerId("a".repeat(60))).toHaveLength(48);
});

test("Werbekonten treffen ihre Seite in beide Richtungen", () => {
  const accounts = [acc("Schäkel Werbekonto"), acc("Janines Pflegeteam"), acc("Fremd")];
  const hits = matchAdAccounts("Pflegedienst Schäkel", accounts);
  expect(hits.map((a) => a.name)).toEqual(["Schäkel Werbekonto"]);
});

test("ein Name, der nur aus Rechtsformen besteht, trifft nichts", () => {
  // Sonst wäre der Schlüssel leer und träfe per Teilstring jedes Konto.
  expect(matchAdAccounts("GmbH", [acc("Irgendwas")])).toEqual([]);
});

const c = (source: string, id: string) => ({ source, id });

test("gleiche Ids werden nach Asset-Id durchnummeriert, nicht nach Array-Reihenfolge", () => {
  const a = dedupeIds([c("p2", "caritas"), c("p1", "caritas")], new Set());
  const b = dedupeIds([c("p1", "caritas"), c("p2", "caritas")], new Set());
  // Die Reihenfolge einer Graph-Edge ist nicht zugesichert. Hinge das Suffix an
  // ihr, tauschten zwei Kunden ihre Ids zwischen zwei Renderings – und ein
  // Lesezeichen zeigte auf den falschen.
  expect(a.find((x) => x.source === "p1")!.id).toBe("caritas");
  expect(a.find((x) => x.source === "p2")!.id).toBe("caritas-2");
  expect(b).toEqual(a.slice().reverse());
});

test("die Reihenfolge der Eingabe bleibt erhalten", () => {
  const out = dedupeIds([c("p2", "x"), c("p1", "x")], new Set());
  expect(out.map((o) => o.source)).toEqual(["p2", "p1"]);
});

test("festgesetzte Ids bleiben, die anderen weichen aus", () => {
  const out = dedupeIds([c("p1", "caritas"), c("p2", "caritas")], new Set(["p2"]));
  expect(out.find((x) => x.source === "p2")!.id).toBe("caritas");
  expect(out.find((x) => x.source === "p1")!.id).toBe("caritas-2");
});
