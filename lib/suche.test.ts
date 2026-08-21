import { expect, test } from "bun:test";
import { suche } from "./suche";

// Nur die netzfreien Wege werden hier geprüft: sobald ein Wortlaut auf die
// Gruppe „Kunden" trifft, ruft suche() listCustomers() und damit den Graph auf.
// Genau das ist der Punkt der beiden Abkürzungen unten – dass sie halten, ist
// prüfbar, ohne Meta zu fragen.

test("ohne Wortlaut sind die Wege die Antwort", async () => {
  const treffer = await suche("");
  expect(treffer.every((t) => t.gruppe === "Wege")).toBe(true);
  expect(treffer.map((t) => t.href)).toContain("/campaigns");
});

test("ein Wortlaut schneidet die Wege zu", async () => {
  const treffer = await suche("kamp", "Wege");
  expect(treffer.map((t) => t.label)).toEqual(["Kampagnen", "Neue Kampagne"]);
});

test("ein Bereich lässt nur seine eigene Gruppe übrig", async () => {
  const treffer = await suche("kunden", "Wege");
  expect(treffer.map((t) => t.href)).toEqual(["/customers"]);
});
