/**
 * Der Auftrag, zusammengesetzt – mit laufender Rückmeldung. Ein Route Handler
 * und keine Server Action, aus demselben Grund wie app/api/launch: eine Action
 * antwortet genau einmal, am Ende. Der Zusammenbau fragt ClickUp, Drive und
 * dreimal Mistral, zusammen leicht zehn Sekunden – so lange stand vorher ein
 * kleiner Spinner auf dem Knopf „Vorschlag erstellen“, und nichts sagte, was
 * gerade gelesen wird und woher der Vorschlag gleich kommt.
 *
 * POST mit JSON statt GET ?task=: die freien Hinweise der bedienenden Person
 * gehören weder in die URL noch in Verlauf oder Access-Log.
 *
 * Eine Meldung je Quelle (lib/brief.ts, BriefEvent), zuletzt das Ergebnis.
 * Angemeldet sein prüft proxy.ts für alles unter /api.
 */
import { MAX_AI_NOTES } from "@/lib/ai-notes";
import { assembleBrief, type AssembledBrief, type BriefEvent } from "@/lib/brief";
import { ndjsonSink } from "@/lib/ndjson";

export type BriefStreamEvent = BriefEvent | { type: "result"; brief?: AssembledBrief; error?: string };
export type BriefRequest = { taskId: string; aiNotes?: string };

const bad = (error: string) => Response.json({ error }, { status: 400 });

export async function POST(request: Request) {
  let body: Partial<Record<keyof BriefRequest, unknown>>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return bad("Kein lesbares JSON.");
  }
  if (typeof body !== "object") return bad("Kein lesbares JSON.");
  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  if (!taskId) return bad("Keine Aufgaben-ID.");
  const aiNotes = body.aiNotes ?? "";
  if (typeof aiNotes !== "string") return bad("Hinweise müssen Text sein.");
  if (aiNotes.length > MAX_AI_NOTES) return bad(`Hinweise: höchstens ${MAX_AI_NOTES} Zeichen.`);

  const sink = ndjsonSink<BriefStreamEvent>();
  // Bewusst nicht awaited: die Antwort geht sofort raus, die Meldungen tröpfeln
  // hinterher.
  void assembleBrief(taskId, aiNotes, undefined, (event) => sink.push(event))
    .then((brief) => sink.push({ type: "result", brief }))
    .catch((e: Error) => sink.push({ type: "result", error: e.message }))
    .finally(() => sink.close());

  return new Response(sink.stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
    },
  });
}
