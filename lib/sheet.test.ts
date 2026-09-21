import { expect, test } from "bun:test";
import { isStale, parseGermanDate, placeQualifier, sheetSections } from "./sheet";

test("placeQualifier: „für <Ort>“ mit und ohne PLZ, sonst nichts", () => {
  expect(placeQualifier("- Führerschein für Bad Sulza")).toBe("Bad Sulza");
  expect(placeQualifier("Für 39218 Schönebeck, 31.08.26:")).toBe("Schönebeck");
  expect(placeQualifier("- Führerschein Klasse B zwingend")).toBeUndefined();
});

test("parseGermanDate und isStale", () => {
  expect(parseGermanDate("31.08.26")?.getFullYear()).toBe(2026);
  expect(parseGermanDate("1.9.2025")?.getMonth()).toBe(8);
  expect(parseGermanDate("kein Datum")).toBeUndefined();
  const now = new Date(2026, 8, 11);
  expect(isStale("31.08.26", now)).toBe(false);
  expect(isStale("01.06.25", now)).toBe(true);
  expect(isStale(undefined, now)).toBe(false);
});

test("offer: auch die Vorlage „Was bieten Sie neuen Mitarbeitern an?“", () => {
  const csv = [
    '"Wo befinden sich die Patienten?","Wie gestalten sich die Arbeitsbedingungen?","Was bieten Sie neuen Mitarbeitern an?"',
    '"- Standort/Radius: zw. 10-15km","Antwort: Früh/Spät, keine Teildienste","Besteht aktuell:"',
    '"","","- 31 Tage Urlaub"',
    '"","","- bAV (nutzen 3 Mitarbeiter)"',
  ].join("\n");
  expect(sheetSections(csv).offer).toBe("Besteht aktuell:\n- 31 Tage Urlaub\n- bAV (nutzen 3 Mitarbeiter)");
});
