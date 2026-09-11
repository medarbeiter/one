/** bun test – die Antwort von Mistral wird defensiv gelesen; die Regeln bleiben fest. */
import { expect, test } from "bun:test";
import { licenseRequired, parseCsv, parseQuestions, questionsPrompt, requirementsBlock, sheetSections } from "./form-questions";

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

// Das Raster der echten Tabelle (Probe vom 2026-09-11): Überschriften als
// schwarze Zeile über mehrere Spalten, die Antworten spaltenweise darunter.
const grid = [
  '"Welche fachlichen Vorraussetzungen muss der Kandidat erfüllen?","","","Sonstiges/sonstige Zertifikate wie z.B. Führerschein?","","","Anzahl der Mitarbeiter, Atmosphäre, Werte..."',
  '"Für 39218 Schönebeck, 31.08.26:","","","- Führerschein für Bad Sulza","","","Mitarbeiter: 120 Mitarbeiter"',
  '"- 3 HK, 2 PFK (für einen 21 jährigen Mann)","","","","","",""',
  '"Für Emmerstedt 38350","","","","","",""',
  '"- Fachkräfte mit Beatmungsschein","","","","","",""',
  '"Wo befinden sich die Patienten?","","","Wie gestalten sich die Arbeitsbedingungen?","","","Was bieten Sie neuen Mitarbeitern an?"',
  '"- Standort/Radius: Bad Sulza","","","- Welche Arbeitszeiten/Schichten sind möglich? Teildienste?","","","Besteht aktuell:"',
  '"","","","Antwort:","","","- e-Bikes"',
  '"- Patientenschlüssel:","","","- Welches Gehalt sind Sie bereit zu zahlen? (Tarif?)","","","- 30 Tage Urlaub"',
  '"","","","Antwort: ""4200€ Brutto""","","",""',
].join("\n");

test("parseCsv: Anführungszeichen, doppelte Anführungszeichen, leere Zeilen", () => {
  expect(parseCsv('"a,b",c\n"sagt ""hi""",\n\n')).toEqual([["a,b", "c"], ['sagt "hi"', ""]]);
});

test("sheetSections liest die drei Abschnitte spaltenweise aus dem Raster", () => {
  const s = sheetSections(grid);
  expect(s.requirements).toContain("Für 39218 Schönebeck, 31.08.26:");
  expect(s.requirements).toContain("Fachkräfte mit Beatmungsschein");
  expect(s.requirements).not.toContain("Führerschein");
  expect(s.requirements).not.toContain("Mitarbeiter");
  expect(s.requirements).not.toContain("Standort/Radius");
  expect(s.certificates).toBe("- Führerschein für Bad Sulza");
  expect(s.conditions).toContain("Welche Arbeitszeiten/Schichten sind möglich? Teildienste?");
  expect(s.conditions).toContain('Antwort: "4200€ Brutto"');
  expect(s.conditions).not.toContain("e-Bikes");
  expect(s.conditions).not.toContain("Patientenschlüssel");
});

test("Führerschein aus der Zertifikate-Spalte – die Überschrift allein zählt nicht", () => {
  expect(licenseRequired({ roles: ["PFK"], onboardingCsv: grid })).toBe(true);
  const empty = grid.replace("- Führerschein für Bad Sulza", "");
  expect(licenseRequired({ roles: ["PFK"], onboardingCsv: empty })).toBe(false);
});

test("der Prompt macht Schichtfragen zur Ausnahme und erlaubt eine leere Liste", () => {
  const p = questionsPrompt({ roles: ["PFK"], onboardingCsv: grid });
  expect(p).toContain("0 bis 3");
  expect(p).toContain("„Früh- und Spätdienst“ allein ist nie ein Grund");
  expect(p).toContain("- Führerschein für Bad Sulza");
  expect(p).toContain("Welche Arbeitszeiten/Schichten");
});

test("Führerschein „für Bad Sulza“ gilt nur für Bad Sulza – ohne Ort für alle", () => {
  expect(licenseRequired({ roles: ["PFK"], onboardingCsv: grid, city: "Bad Sulza" })).toBe(true);
  expect(licenseRequired({ roles: ["PFK"], onboardingCsv: grid, city: "Gera" })).toBe(false);
  expect(licenseRequired({ roles: ["PFK"], onboardingCsv: grid })).toBe(true);
  expect(licenseRequired({ roles: ["PFK"], notes: "Führerschein nötig", city: "Gera" })).toBe(true);
});
