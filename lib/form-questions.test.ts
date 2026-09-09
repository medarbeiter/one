/** bun test – die Antwort von Mistral wird defensiv gelesen; die Regeln bleiben fest. */
import { expect, test } from "bun:test";
import { licenseRequired, parseQuestions, questionsPrompt, requirementsBlock } from "./form-questions";

test("JSON mit und ohne Zaun, Fremdes fällt heraus, höchstens vier", () => {
  const raw = '```json\n[{"label":"A?","options":["Ja","Nein"],"disqualify":["Nein"]},{"label":"","options":["x","y"]},{"label":"B?","options":["nur eine"]},{"label":"C?","options":["1","2"],"goto":{"1":"lead","2":3,"x":"weg","3":-1}},{"label":"D?","options":["1","2"],"goto":7},{"label":"E?","options":["1","2"]}]\n```';
  const qs = parseQuestions(raw);
  expect(qs.map((q) => q.label)).toEqual(["A?", "C?", "D?", "E?"]);
  expect(qs[0].goto).toEqual({ Nein: "nolead" });
  expect(qs[1].goto).toEqual({ "1": "lead", "2": 3 });
  expect(qs[2].goto).toEqual({});
  expect(parseQuestions("kein json")).toEqual([]);
});

test("Bausteine kommen per id, unbekannte ids fallen heraus", () => {
  const qs = parseQuestions('[{"brick":"pfk-ausbildung"},{"brick":"gibt-es-nicht"},{"brick":"nachtdienst"}]');
  expect(qs.map((q) => q.label)).toEqual(["Hast du eine abgeschlossene 3-jährige Ausbildung in der Pflege?", "Bist du bereit, im Nachtdienst zu arbeiten?"]);
  expect(qs[1].goto).toEqual({ Nein: "nolead" });
});

const csv = `"Wie gestaltet sich Ihr Jobangebot?",""
"Besteht aktuell","Dienstwagen auch privat"
"Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?",""
"","- PFK mit 3-jähriger Ausbildung"
"","- Führerschein Klasse B zwingend"
"Wie läuft das Bewerbungsgespräch ab?",""
"","Telefonisch"`;

test("Führerschein nur, wenn Aufgabe oder Voraussetzungen ihn verlangen – Benefits zählen nicht", () => {
  expect(licenseRequired({ roles: ["PFK"], onboardingCsv: csv })).toBe(true);
  expect(licenseRequired({ roles: ["PFK"], notes: "Führerschein nötig" })).toBe(true);
  expect(licenseRequired({ roles: ["PFK"], benefits: "Dienstwagen, Führerschein Klasse B nötig" })).toBe(false);
  expect(licenseRequired({ roles: ["PFK"], notes: "Standort Hennef" })).toBe(false);
});

test("der Voraussetzungen-Block endet an der nächsten Frage der Tabelle", () => {
  const block = requirementsBlock(csv);
  expect(block).toContain("Führerschein Klasse B");
  expect(block).not.toContain("Bewerbungsgespräch");
  expect(requirementsBlock("")).toBe("");
});

test("der Prompt nennt Stellen, Voraussetzungen und die festen Fragen", () => {
  const p = questionsPrompt({ roles: ["PFK"], roleFreeText: "Praxisanleiter", onboardingCsv: csv });
  expect(p).toContain("Pflegefachkräfte, Praxisanleiter");
  expect(p).toContain("Führerschein Klasse B zwingend");
  expect(p).toContain("3-jährige Ausbildung in der Pflege");
  expect(p).toContain("mit ihrer Dauer");
  expect(p).toContain("- nachtdienst: „Bist du bereit, im Nachtdienst zu arbeiten?“ → „Ja“ / „Nein“ (Kein Lead)");
});
