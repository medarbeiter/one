/** bun test – die Antwort von Mistral wird defensiv gelesen; die Regeln bleiben fest. */
import { expect, test } from "bun:test";
import { licenseRequired, parseQuestions, questionsPrompt } from "./form-questions";

test("JSON mit und ohne Zaun, Fremdes fällt heraus, höchstens drei", () => {
  const raw = '```json\n[{"label":"A?","options":["Ja","Nein"],"disqualify":["Nein"]},{"label":"","options":["x","y"]},{"label":"B?","options":["nur eine"]},{"label":"C?","options":["1","2"],"disqualify":7},{"label":"D?","options":["1","2"]},{"label":"E?","options":["1","2"]}]\n```';
  const qs = parseQuestions(raw);
  expect(qs.map((q) => q.label)).toEqual(["A?", "C?", "D?"]);
  expect(qs[1].disqualify).toEqual([]);
  expect(parseQuestions("kein json")).toEqual([]);
});

test("Führerschein nur, wenn er irgendwo verlangt wird", () => {
  expect(licenseRequired({ roles: ["PFK"], benefits: "Dienstwagen, Führerschein Klasse B nötig" })).toBe(true);
  expect(licenseRequired({ roles: ["PFK"], notes: "Standort Hennef" })).toBe(false);
});

test("der Prompt nennt die Stellen und verbietet die festen Fragen", () => {
  const p = questionsPrompt({ roles: ["PFK"], roleFreeText: "Praxisanleiter" });
  expect(p).toContain("Pflegefachkraft, Praxisanleiter");
  expect(p).toContain("Keine Frage nach dem Führerschein");
});
