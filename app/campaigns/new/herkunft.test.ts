import { expect, test } from "bun:test";
import { groupBelege, herkunftLabel, splitBelege } from "./herkunft";

test("herkunftLabel: eine Quelle wie bisher, mehrere in der gegebenen Reihenfolge verbunden", () => {
  expect(herkunftLabel("clickup")).toBe("aus ClickUp");
  expect(herkunftLabel(["onboarding"])).toBe("aus der Onboarding-Tabelle");
  expect(herkunftLabel(["clickup", "onboarding"])).toBe("aus ClickUp + Onboarding");
  expect(herkunftLabel(["user", "clickup"])).toBe("aus deinem Hinweis + ClickUp");
  expect(herkunftLabel(["user"])).toBe("aus deinem Hinweis");
  expect(herkunftLabel([])).toBeUndefined();
  expect(herkunftLabel(undefined)).toBeUndefined();
});

test("splitBelege: genutzte Quellen zuerst, der Rest bleibt sichtbar", () => {
  const a = { source: "clickup" as const, quote: "Renningen" };
  const b = { source: "onboarding" as const, quote: "Stuttgart" };
  expect(splitBelege(["clickup"], [a, b])).toEqual({ genutzt: [a], weitere: [b] });
  expect(splitBelege(["hand"], [a, b])).toEqual({ genutzt: [], weitere: [a, b] });
  expect(herkunftLabel("hand")).toBe("von Hand geändert");
});

test("groupBelege: ein Kopf je Dokument, die Stellen darunter", () => {
  const g = groupBelege([
    { source: "clickup", title: "Aufgabe „X“", where: "Feld", quote: "s. OB", url: "u" },
    { source: "clickup", title: "Aufgabe „X“", where: "Beschreibung", quote: "PFK", url: "u" },
    { source: "onboarding", title: "Tabelle „Y“", where: "Stellen", quote: "PHK" },
    { source: "session" },
  ]);
  expect(g.map((x) => [x.title, x.rows.length, x.url])).toEqual([
    ["Aufgabe „X“", 2, "u"],
    ["Tabelle „Y“", 1, undefined],
    ["aus der Anmeldung", 0, undefined],
  ]);
});
