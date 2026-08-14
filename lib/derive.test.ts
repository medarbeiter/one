/**
 * Zwei Aufgaben, zwei Funktionen: matchKey ordnet Werbekonten zu und wirft dafür
 * Rechtsformen weg, customerId benennt den Kunden und behält seinen Namen.
 */
import { expect, test } from "bun:test";
import { customerId, matchAdAccounts, matchKey, normalise } from "./derive";

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
