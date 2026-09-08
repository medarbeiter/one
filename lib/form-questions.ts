/**
 * Mistral schlägt die Qualifizierungsfragen vor – die sind je Stelle
 * verschieden und stehen nirgends als Regel. Was fest ist (PFK-Ausbildung,
 * Führerschein, Erreichbarkeit, Kontakt), setzt lib/form-spec.ts danach
 * deterministisch davor bzw. dahinter. Läuft nur auf dem Server.
 */
import { mistral, roleLabels } from "./bodies";
import { assembleQuestions, templateQuestions, type FormQuestion } from "./form-spec";

export type QuestionsInput = {
  roles: string[];
  roleFreeText?: string;
  /** Benefits und Anforderungen des Kunden – dort steht, ob ein Führerschein Pflicht ist. */
  benefits?: string;
  /** Aufgabenbeschreibung und Hinweise – dieselbe Quelle wie für die Texte. */
  notes?: string;
  instructions?: string;
};

const LICENSE = /f[üu]hrerschein|fahrerlaubnis|pkw|klasse b/i;

export function licenseRequired(input: QuestionsInput): boolean {
  return LICENSE.test([input.benefits, input.notes, input.instructions].filter(Boolean).join("\n"));
}

export function questionsPrompt(input: QuestionsInput): string {
  const roles = roleLabels(input.roles, input.roleFreeText).join(", ") || "Pflegekräfte";
  const context = [input.notes, input.benefits, input.instructions].filter((s) => s?.trim()).join("\n\n");
  return `Du entwirfst Qualifizierungsfragen für ein Meta-Lead-Formular einer Pflege-Stellenanzeige (Bewerbung per Handy, Du-Ansprache).

GESUCHTE STELLEN: ${roles}

KONTEXT AUS AUFGABE UND ONBOARDING (kann leer sein):
${context || "–"}

SO SEHEN DIE FORMULARE DER AGENTUR AUS (Beispiele, Ton und Länge genau so treffen):
- Pflegefachkraft: „Hast du eine abgeschlossene 3-jährige Ausbildung in der Pflege?“ → Ja / Nein
- Fachkraft: „Hast du eine Ausbildung in der Pflege?“ → Ja, als Fachkraft / Ja, als Hilfskraft / Nein, keine Ausbildung
- Hilfskraft/Quereinsteiger: „Welche Qualifikation hast du in der Pflege?“ → Gelernte Pflegehelfer/in / LG1-Schein / Erfahrung, aber keine Ausbildung / Keine Erfahrung/Ausbildung; „Möchtest du die Pflege gern kennenlernen?“ → Ja / Nein
- Allgemein: „Möchtest du gerne im Umgang mit Menschen arbeiten?“ → Ja / Nein

REGELN:
- Höchstens 2 Multiple-Choice-Fragen im Stil der Beispiele: eine zur Qualifikation für genau diese Stelle, höchstens eine zur Erfahrung oder Motivation.
- Jede Frage kurz (höchstens 80 Zeichen), freundlich, per Du. 2 bis 4 Antworten, jede höchstens 3 Wörter – am liebsten „Ja“ / „Nein“. Keine Erklärsätze in den Antworten.
- Keine Frage nach Qualifikation, Abschluss oder Ausbildung, wenn Pflegefachkräfte gesucht sind – die kommt fest dazu.
- Nenne je Frage, welche Antworten eindeutig NICHT passen (disqualify). Bei "Ja/Nein"-Fragen ist das meist "Nein". Erfinde keine Ausschlüsse, die der Kunde nicht verlangt.
- Keine Frage nach Ausbildung, wenn Quereinsteiger gesucht sind.
- Keine Frage nach dem Führerschein und keine Kontaktfrage – die kommen fest dazu.
- Keine Frage nach Gehalt, Alter, Herkunft, Gesundheit oder Familie.

Antworte NUR mit JSON, ohne Erklärung:
[{"label":"…","options":["…","…"],"disqualify":["…"]}]`;
}

const unfence = (s: string) => s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();

/** Defensiv wie parseCampaignContext in lib/brief.ts: alles Fremde fällt heraus. */
export function parseQuestions(content: string): FormQuestion[] {
  let data: unknown;
  try {
    data = JSON.parse(unfence(content));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  return data
    .map((q) => ({ label: str((q as { label?: unknown })?.label), options: list((q as { options?: unknown })?.options), disqualify: list((q as { disqualify?: unknown })?.disqualify) }))
    .filter((q) => q.label && q.options.length >= 2)
    .slice(0, 3);
}

export async function suggestQuestions(input: QuestionsInput): Promise<FormQuestion[]> {
  let suggested: FormQuestion[] = [];
  // Mistral nur, wenn keine Vorlage zur Stellenklasse passt (BK, HW, Koch, Freitext).
  if (templateQuestions(input.roles)) return assembleQuestions({ roles: input.roles, suggested, licenseRequired: licenseRequired(input) });
  try {
    suggested = parseQuestions(await mistral(questionsPrompt(input), { temperature: 0.2 }));
  } catch (e) {
    // Ohne Vorschlag bleiben die festen Fragen – die Vorlage ist trotzdem brauchbar.
    console.warn("Fragenvorschlag fehlgeschlagen:", (e as Error).message);
  }
  return assembleQuestions({ roles: input.roles, suggested, licenseRequired: licenseRequired(input) });
}
