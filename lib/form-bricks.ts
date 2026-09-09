/**
 * Fragebausteine: fertige Qualifizierungsfragen mit Antworten und Logik, wie
 * die Agentur sie in ihren Formularen stellt. Der Editor bietet sie als Menü,
 * die KI (lib/form-questions.ts) darf sie per id einsetzen statt eine eigene
 * Fassung zu schreiben – so bleiben Wortlaut und Ausschlüsse überall gleich.
 */
import { LICENSE_QUESTION, PFK_QUESTION, type FormQuestion } from "./form-spec";

export type FormBrick = { id: string; question: FormQuestion };

export const BRICKS: readonly FormBrick[] = [
  { id: "pfk-ausbildung", question: PFK_QUESTION },
  {
    id: "ausbildung",
    question: {
      label: "Hast du eine Ausbildung in der Pflege?",
      options: ["Ja, die 3-jährige Ausbildung zur Pflegefachkraft", "Ja, die 1-jährige Ausbildung zur Pflegehilfskraft", "Nein, keine Ausbildung"],
      goto: { "Nein, keine Ausbildung": "nolead" },
    },
  },
  {
    id: "qualifikation-hilfskraft",
    question: {
      label: "Welche Qualifikation hast du in der Pflege?",
      options: ["Gelernte Pflegehelfer/in (1 Jahr)", "LG1-Schein", "Erfahrung, aber keine Ausbildung", "Keine Erfahrung"],
      goto: { "Keine Erfahrung": "nolead" },
    },
  },
  {
    id: "erfahrung",
    question: { label: "Wie viel Erfahrung hast du in der Pflege?", options: ["Mehr als 2 Jahre", "Weniger als 2 Jahre"], goto: {} },
  },
  {
    id: "quereinsteiger",
    question: { label: "Möchtest du die Pflege gern kennenlernen?", options: ["Ja", "Nein"], goto: { Nein: "nolead" } },
  },
  {
    id: "frueh-spaet",
    question: { label: "Bist du bereit, im Früh- und Spätdienst zu arbeiten?", options: ["Ja", "Nein"], goto: { Nein: "nolead" } },
  },
  { id: "nachtdienst", question: { label: "Bist du bereit, im Nachtdienst zu arbeiten?", options: ["Ja", "Nein"], goto: { Nein: "nolead" } } },
  { id: "wochenende", question: { label: "Bist du bereit, am Wochenende zu arbeiten?", options: ["Ja", "Nein"], goto: { Nein: "nolead" } } },
  { id: "fuehrerschein", question: LICENSE_QUESTION },
  {
    id: "arbeitszeit",
    question: { label: "Wie möchtest du arbeiten?", options: ["Vollzeit", "Teilzeit", "Minijob"], goto: {} },
  },
  {
    id: "deutsch",
    question: { label: "Wie gut sprichst du Deutsch?", options: ["Muttersprache oder fließend", "Gut (B2)", "Grundkenntnisse"], goto: { Grundkenntnisse: "nolead" } },
  },
  {
    id: "start",
    question: { label: "Wann könntest du anfangen?", options: ["Sofort", "In 1–3 Monaten", "Später"], goto: {} },
  },
];

export const brick = (id: string): FormBrick | undefined => BRICKS.find((b) => b.id === id);

/** Eine Zeile je Baustein für den Prompt: id, Frage, Antworten mit Ziel. */
export function bricksForPrompt(): string {
  const goto = (q: FormQuestion, o: string) => {
    const g = q.goto[o];
    return g === "nolead" ? " (Kein Lead)" : g === "lead" ? " (Formular senden)" : "";
  };
  return BRICKS.map((b) => `- ${b.id}: „${b.question.label}“ → ${b.question.options.map((o) => `„${o}“${goto(b.question, o)}`).join(" / ")}`).join("\n");
}
