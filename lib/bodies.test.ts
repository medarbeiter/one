import { expect, test } from "bun:test";
import { parseBody, parseTitles, roleLabels } from "./bodies";

test("parseTitles liest die Liste, wirft zu Lange weg und kappt bei fünf", () => {
  expect(parseTitles('{"titel": ["Kurz", "  Pflege-Jobs (m/w/d)  "]}')).toEqual([
    "Kurz",
    "Pflege-Jobs (m/w/d)",
  ]);
  // 41–60 Zeichen füllen nur Restplätze (kurze zuerst), über 60 fliegt raus.
  const longish = "x".repeat(45);
  expect(parseTitles(JSON.stringify({ titel: [longish, "Ok"] }))).toEqual(["Ok", longish]);
  expect(() => parseTitles(JSON.stringify({ titel: ["x".repeat(61)] }))).toThrow("zu lang");
  const seven = Array.from({ length: 7 }, (_, i) => `Titel ${i}`);
  expect(parseTitles(JSON.stringify({ titel: seven }))).toHaveLength(5);
  expect(parseTitles('{"titel": ["Gleich", "gleich", "Anders"]}')).toEqual(["Gleich", "Anders"]);
  expect(() => parseTitles("kein json")).toThrow("kein lesbares JSON");
  expect(() => parseTitles('{"titel": []}')).toThrow("keine Überschriftenliste");
});

test("parseBody nimmt reinen Text und streift Zaun und Anführungszeichen ab", () => {
  expect(parseBody("Du bist Pflegefachkraft?\n\nDann komm zu uns.")).toBe(
    "Du bist Pflegefachkraft?\n\nDann komm zu uns.",
  );
  expect(parseBody('```\n"Komm zu uns."\n```')).toBe("Komm zu uns.");
  expect(parseBody("„Komm zu uns.“")).toBe("Komm zu uns.");
  expect(() => parseBody("```\n```")).toThrow("keinen Text");
});

test("roleLabels übersetzt Kürzel und hängt den Freitext an", () => {
  expect(roleLabels(["PFK", "PDL"], " Koch ")).toEqual([
    "Pflegefachkraft",
    "Pflegedienstleitung",
    "Koch",
  ]);
  expect(roleLabels(["unbekannt"], "")).toEqual([]);
});
