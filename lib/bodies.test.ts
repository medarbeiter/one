import { expect, test } from "bun:test";
import { parseBody, parseTitles, roleLabels } from "./bodies";

test("parseTitles liest die Liste, wirft zu Lange weg und kappt bei zehn", () => {
  expect(parseTitles('{"titel": ["Kurz", "  Pflege-Jobs (m/w/d)  "]}')).toEqual([
    "Kurz",
    "Pflege-Jobs (m/w/d)",
  ]);
  const long = "x".repeat(41);
  expect(parseTitles(JSON.stringify({ titel: [long, "Ok"] }))).toEqual(["Ok"]);
  expect(() => parseTitles(JSON.stringify({ titel: [long] }))).toThrow("zu lang");
  const twelve = Array.from({ length: 12 }, (_, i) => `Titel ${i}`);
  expect(parseTitles(JSON.stringify({ titel: twelve }))).toHaveLength(10);
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
