/**
 * Der Baukasten als Gespräch: „mach die Führerschein-Frage weg und frag nach
 * Erfahrung“ statt sechs Klicks. Zurück kommt immer der ganze Fragensatz –
 * ein Patch-Format („Frage 3 ändern“) hätte die KI bei jeder Umnummerierung
 * danebengreifen lassen, und die Antwortwege zeigen auf Fragenummern.
 *
 * Rein wie lib/form-spec.ts: der Prompt und das Auslesen stehen hier prüfbar,
 * der Netzaufruf ist die einzige unreine Zeile.
 */
import { FORM_MODEL, mistral } from "./bodies";
import { questionList, unfence } from "./form-questions";
import { dropOrphanJumps, gotoOf, REACHABILITY, type FormQuestion } from "./form-spec";

export type ChatTurn = { role: "user" | "assistant"; text: string };

/** Fehlt `questions`, bleibt der Fragensatz, wie er war – die KI hat nur geantwortet. */
export type FormEdit = { reply: string; questions?: FormQuestion[]; freeText?: string[] };

export type ChatInput = {
  message: string;
  history: ChatTurn[];
  questions: FormQuestion[];
  freeText: string[];
  business: string;
  roles: string[];
  roleFreeText?: string;
  city: string;
};

const MAX_QUESTIONS = 6;
const MAX_FREE_TEXT = 6;
/** Mehr Verlauf braucht niemand: die Fragen stehen ohnehin vollständig im Prompt. */
const HISTORY_TURNS = 8;

const asJson = (questions: FormQuestion[], freeText: string[]) =>
  JSON.stringify(
    {
      questions: questions.map((q) => ({
        label: q.label,
        options: q.options,
        goto: Object.fromEntries(q.options.map((o) => [o, gotoOf(q, o)])),
      })),
      freeText,
    },
    null,
    1,
  );

export function chatPrompt(input: ChatInput): string {
  const verlauf = input.history
    .slice(-HISTORY_TURNS)
    .map((t) => `${t.role === "user" ? "BEDIENER" : "DU"}: ${t.text}`)
    .join("\n");
  return `Du bearbeitest die Fragen eines Meta-Lead-Formulars für eine Pflege-Stellenanzeige (Bewerbung per Handy, Du-Ansprache). Der Bediener der Agentur sagt dir in Worten, was er geändert haben will; du gibst den vollständigen Fragensatz zurück.

KUNDE: ${input.business}
STELLEN: ${[...input.roles, input.roleFreeText].filter((r) => r?.trim()).join(", ") || "Pflegekräfte"}
ORT: ${input.city || "unbekannt"}

AKTUELLER STAND (JSON):
${asJson(input.questions, input.freeText)}
${verlauf ? `\nBISHERIGES GESPRÄCH:\n${verlauf}\n` : ""}
WUNSCH DES BEDIENERS:
${input.message}

REGELN:
- Höchstens ${MAX_QUESTIONS} Auswahlfragen, je 2 bis 4 Antworten. Freitextfragen haben keine Antwortwege.
- "goto" nennt je Antwort das Ziel: "next" (nächste Frage, darf auch fehlen), "nolead" (kein Lead, Formular schließen) oder die Nummer einer SPÄTEREN Frage (1-basiert, gezählt in der Liste, die du zurückgibst).
- Zum Lead führt KEINE Antwort, „lead“ gibt es nicht. Wer durchkommt, läuft bis ans Ende durch: nach der letzten Frage kommen „${REACHABILITY}“ und die Kontaktdaten, und erst danach gilt die Bewerbung als Lead. Verlangt der Bediener „direkt absenden“, erkläre das in "reply".
- Springst du, muss jede Frage dazwischen von irgendeiner anderen Antwort erreichbar bleiben – sonst sieht sie niemand. Im Zweifel nicht springen, sondern "next".
- Mindestens eine Antwort im ganzen Formular muss "nolead" sein – sonst filtert das Formular nichts.
- Keine Frage darf jede Antwort auf "nolead" schicken.
- Ausbildungen immer mit Dauer nennen: „3-jährige Ausbildung zur Pflegefachkraft“, „1-jährige Ausbildung zur Pflegehilfskraft“.
- „${REACHABILITY}“ und die Kontaktfelder stehen fest und gehören NICHT in deine Antwort.
- Ändere nur, was der Bediener will. Alles andere gibst du unverändert zurück.
- Fragt der Bediener bloß etwas, antworte in "reply" und lass "questions" und "freeText" weg.
- "reply": ein bis zwei Sätze auf Deutsch, was du geändert hast.

Antworte NUR mit JSON, ohne Erklärung:
{"reply":"…","questions":[{"label":"…","options":["Ja","Nein"],"goto":{"Nein":"nolead"}}],"freeText":["…"]}`;
}

/** Defensiv wie parseQuestions: fehlende oder fremde Felder lassen den Stand, wie er ist. */
export function parseFormEdit(content: string): FormEdit {
  let data: unknown;
  try {
    data = JSON.parse(unfence(content));
  } catch {
    // Kein JSON: die KI hat geplaudert statt geliefert – das ist die Antwort.
    return { reply: content.trim() };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { reply: "" };
  const obj = data as Record<string, unknown>;
  const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  const seen = new Set<string>();
  return {
    reply,
    ...("questions" in obj ? { questions: dropOrphanJumps(questionList(obj.questions, MAX_QUESTIONS)) } : {}),
    ...("freeText" in obj
      ? {
          freeText: (Array.isArray(obj.freeText) ? obj.freeText : [])
            .map((t) => (typeof t === "string" ? t.trim() : ""))
            .filter((t) => {
              const key = t.toLowerCase();
              if (!t || key === REACHABILITY.toLowerCase() || seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, MAX_FREE_TEXT),
        }
      : {}),
  };
}

export async function chatForm(input: ChatInput): Promise<FormEdit> {
  const edit = parseFormEdit(await mistral(chatPrompt(input), { model: FORM_MODEL, temperature: 0.2 }));
  return edit.reply ? edit : { ...edit, reply: "Erledigt – sieh dir die Fragen links an." };
}
