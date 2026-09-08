/**
 * Mistral schlägt die Qualifizierungsfragen vor – die sind je Stelle
 * verschieden und stehen nirgends als Regel. Was fest ist (PFK-Ausbildung,
 * Führerschein, Erreichbarkeit, Kontakt), setzt lib/form-spec.ts danach
 * deterministisch davor bzw. dahinter. Läuft nur auf dem Server.
 */
import { mistral, roleLabels } from "./bodies";
import { assembleQuestions, roleChoiceQuestion, type FormQuestion } from "./form-spec";

export type QuestionsInput = {
  roles: string[];
  roleFreeText?: string;
  /** Benefits und Anforderungen des Kunden – dort steht, ob ein Führerschein Pflicht ist. */
  benefits?: string;
  /** Aufgabenbeschreibung und Hinweise – dieselbe Quelle wie für die Texte. */
  notes?: string;
  instructions?: string;
  /** Der CSV-Export der Onboarding-Tabelle – dort stehen die fachlichen Voraussetzungen. */
  onboardingCsv?: string;
};

const LICENSE = /f[üu]hrerschein|fahrerlaubnis|pkw|klasse b/i;

/** Der Führerschein kommt nur ins Formular, wenn Aufgabe oder Onboarding ihn nennen – im Onboarding zählt nur der Block der Voraussetzungen. */
export function licenseRequired(input: QuestionsInput): boolean {
  return LICENSE.test([input.notes, input.instructions, requirementsBlock(input.onboardingCsv)].filter(Boolean).join("\n"));
}

/** Aus der Onboarding-Tabelle nur den Block „Welche fachlichen Voraussetzungen muss der Kandidat erfüllen?“ – bis zur nächsten Frage-Überschrift. */
export function requirementsBlock(csv?: string): string {
  if (!csv) return "";
  const lines = csv.split("\n");
  const start = lines.findIndex((l) => /voraussetzung/i.test(l));
  if (start < 0) return "";
  const out = [lines[start]];
  for (const l of lines.slice(start + 1)) {
    if (/^"?[^",]*\?/.test(l) && out.length > 1) break; // die nächste Frage der Tabelle
    out.push(l);
    if (out.length > 40) break;
  }
  return out.join("\n").trim();
}

export function questionsPrompt(input: QuestionsInput): string {
  const roles = roleLabels(input.roles, input.roleFreeText).join(", ") || "Pflegekräfte";
  const req = requirementsBlock(input.onboardingCsv);
  const fixed = [
    input.roles.includes("PFK") ? "„Hast du eine abgeschlossene 3-jährige Ausbildung in der Pflege?“ (Ja/Nein)" : "",
    roleChoiceQuestion(input.roles, input.roleFreeText) ? "„Für welche Stelle interessierst du dich?“" : "",
    "die Führerschein-Frage (kommt automatisch, falls verlangt)",
    "„Wann bist du am besten erreichbar?“ und die Kontaktfelder",
  ].filter(Boolean);
  return `Du entwirfst die Qualifizierungsfragen für ein Meta-Lead-Formular einer Pflege-Stellenanzeige (Bewerbung per Handy, Du-Ansprache). Das Formular ist ein Filter: zu viel Reibung kostet Bewerber, zu wenig lässt jeden durch. Finde die Balance – frag nur, was für diesen Kunden wirklich entscheidet.

GESUCHTE STELLEN: ${roles}

AUFGABE (Beschreibung und Hinweise der Agentur):
${[input.notes, input.instructions].filter((t) => t?.trim()).join("\n\n") || "–"}

FACHLICHE VORAUSSETZUNGEN AUS DER ONBOARDING-TABELLE DES KUNDEN (maßgeblich – hier steht, wen er wirklich nimmt):
${req || "–"}

BENEFITS (nur Kontext, daraus entstehen keine Fragen):
${input.benefits?.trim() || "–"}

SO KLINGEN DIE FORMULARE DER AGENTUR (Ton und Länge treffen, Inhalt an den Kunden anpassen):
- „Hast du eine Ausbildung in der Pflege?“ → „Ja, die 3-jährige Ausbildung zur Pflegefachkraft“ / „Ja, die 1-jährige Ausbildung zur Pflegehilfskraft“ / „Nein, keine Ausbildung“
- „Welche Qualifikation hast du in der Pflege?“ → „Gelernte Pflegehelfer/in (1 Jahr)“ / „LG1-Schein“ / „Erfahrung, aber keine Ausbildung“ / „Keine Erfahrung“
- „Wie viel Erfahrung hast du in der Pflege?“ → „Mehr als 2 Jahre“ / „Weniger als 2 Jahre“
- „Möchtest du die Pflege gern kennenlernen?“ → „Ja“ / „Nein“
- „Bist du bereit, im Früh- und Spätdienst zu arbeiten?“ → „Ja“ / „Nein“

REGELN:
- 1 bis 3 Multiple-Choice-Fragen. Jede Frage muss sich aus den Stellen, der Aufgabe oder den Voraussetzungen begründen – keine allgemeinen Fragen.
- Ausbildungen immer mit ihrer Dauer nennen: 3-jährige Ausbildung zur Pflegefachkraft, 1-jährige Ausbildung zur Pflegehilfskraft, LG1-Schein. Nie nur „Ja, als Fachkraft“.
- Verlangt der Kunde etwas ausdrücklich (bestimmte Ausbildung, Schichten, Wochenende, Nachtdienst, Erfahrung, Sprache), frag genau danach und setze die Antworten, die ihn nicht erfüllen, in "disqualify". Wünsche ohne Muss werden gefragt, aber nicht ausgeschlossen.
- Antworten kurz (höchstens 6 Wörter), 2 bis 4 je Frage, ohne Erklärsätze.
- Nicht fragen (kommt fest dazu oder ist tabu): ${fixed.join("; ")}. Kein Gehalt, Alter, Herkunft, Gesundheit, Familie.
- Keine Frage nach Ausbildung, wenn ausdrücklich Quereinsteiger ohne Ausbildung gesucht sind.

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
    .slice(0, 4);
}

export async function suggestQuestions(input: QuestionsInput): Promise<FormQuestion[]> {
  let suggested: FormQuestion[] = [];
  try {
    suggested = parseQuestions(await mistral(questionsPrompt(input), { temperature: 0.2 }));
  } catch (e) {
    // Ohne Vorschlag bleiben die festen Fragen – die Vorlage ist trotzdem brauchbar.
    console.warn("Fragenvorschlag fehlgeschlagen:", (e as Error).message);
  }
  return assembleQuestions({ roles: input.roles, roleFreeText: input.roleFreeText, suggested, licenseRequired: licenseRequired(input) });
}
