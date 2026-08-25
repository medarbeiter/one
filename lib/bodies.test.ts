import { expect, test } from "bun:test";
import { parseBodies, roleLabels } from "./bodies";

test("parseBodies liest das JSON-Objekt und toleriert einen Markdown-Zaun", () => {
  const texts = ["Text eins", "Text zwei"];
  expect(parseBodies(JSON.stringify({ texte: texts }))).toEqual(texts);
  expect(parseBodies("```json\n" + JSON.stringify({ texte: texts }) + "\n```")).toEqual(texts);
});

test("parseBodies kappt bei fünf und lehnt Antworten ohne Textliste ab", () => {
  const seven = ["1", "2", "3", "4", "5", "6", "7"];
  expect(parseBodies(JSON.stringify({ texte: seven }))).toHaveLength(5);
  expect(() => parseBodies("kein json")).toThrow("kein lesbares JSON");
  expect(() => parseBodies('{"texte": []}')).toThrow("keine Textliste");
  expect(() => parseBodies('{"texte": [1, 2]}')).toThrow("keine Textliste");
});

test("roleLabels übersetzt Kürzel und hängt den Freitext an", () => {
  expect(roleLabels(["PFK", "PDL"], " Koch ")).toEqual([
    "Pflegefachkraft",
    "Pflegedienstleitung",
    "Koch",
  ]);
  expect(roleLabels(["unbekannt"], "")).toEqual([]);
});
