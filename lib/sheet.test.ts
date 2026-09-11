import { expect, test } from "bun:test";
import { isStale, parseGermanDate, placeQualifier } from "./sheet";

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
