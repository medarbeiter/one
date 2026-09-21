/**
 * bun test – was die KI im Gespräch zurückschickt, landet ungefragt im Editor.
 * Geprüft wird deshalb das Auslesen: nur erkannte Felder dürfen durch.
 */
import { expect, test } from "bun:test";
import { chatPrompt, parseFormEdit } from "./form-chat";
import { REACHABILITY } from "./form-spec";

test("Antwort mit Fragen ersetzt den Stand", () => {
  const edit = parseFormEdit(
    '```json\n{"reply":"Erfahrung ergänzt.","questions":[{"label":"Erfahrung?","options":["Ja","Nein"],"goto":{"Nein":"nolead","Ja":"next"}}],"freeText":["Warum du?","Warum du?","' +
      REACHABILITY +
      '"]}\n```',
  );
  expect(edit.reply).toBe("Erfahrung ergänzt.");
  // "next" ist der Standard und steht nicht im Ziel-Objekt.
  expect(edit.questions).toEqual([{ label: "Erfahrung?", options: ["Ja", "Nein"], goto: { Nein: "nolead" } }]);
  // Doppeltes fällt weg, die feste Erreichbarkeitsfrage auch.
  expect(edit.freeText).toEqual(["Warum du?"]);
});

test("eine bloße Rückfrage lässt die Fragen, wie sie sind", () => {
  const edit = parseFormEdit('{"reply":"Meinst du die zweite Frage?"}');
  expect(edit.reply).toBe("Meinst du die zweite Frage?");
  expect(edit.questions).toBeUndefined();
  expect(edit.freeText).toBeUndefined();
});

test("kein JSON ist trotzdem eine Antwort, ändert aber nichts", () => {
  const edit = parseFormEdit("Das kann ich so nicht.");
  expect(edit).toEqual({ reply: "Das kann ich so nicht." });
});

test("der Prompt trägt den aktuellen Stand und den Wunsch", () => {
  const prompt = chatPrompt({
    message: "Nimm die Führerschein-Frage raus.",
    history: [{ role: "user", text: "Kürzer bitte" }],
    questions: [{ label: "Führerschein?", options: ["Ja", "Nein"], goto: { Nein: "nolead" } }],
    freeText: [],
    business: "Pflegedienst Klee",
    roles: ["PFK"],
    city: "Renningen",
  });
  expect(prompt).toContain("Führerschein?");
  expect(prompt).toContain("Nimm die Führerschein-Frage raus.");
  expect(prompt).toContain("Kürzer bitte");
  expect(prompt).toContain("Pflegedienst Klee");
});
