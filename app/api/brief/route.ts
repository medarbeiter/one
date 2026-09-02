/**
 * Der Auftrag, zusammengesetzt – mit laufender Rückmeldung. Ein Route Handler
 * und keine Server Action, aus demselben Grund wie app/api/launch: eine Action
 * antwortet genau einmal, am Ende. Der Zusammenbau fragt ClickUp, Drive und
 * zweimal Mistral, zusammen leicht zehn Sekunden – so lange stand vorher ein
 * kleiner Spinner auf dem Knopf „Vorschlag erstellen“, und nichts sagte, was
 * gerade gelesen wird und woher der Vorschlag gleich kommt.
 *
 * Eine Meldung je Quelle (lib/brief.ts, BriefEvent), zuletzt das Ergebnis.
 * Angemeldet sein prüft proxy.ts für alles unter /api.
 */
import { assembleBrief, type AssembledBrief, type BriefEvent } from "@/lib/brief";
import { ndjsonSink } from "@/lib/ndjson";

export type BriefStreamEvent = BriefEvent | { type: "result"; brief?: AssembledBrief; error?: string };

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("task")?.trim();
  if (!taskId) return Response.json({ error: "Keine Aufgaben-ID." }, { status: 400 });

  const sink = ndjsonSink<BriefStreamEvent>();
  // Bewusst nicht awaited: die Antwort geht sofort raus, die Meldungen tröpfeln
  // hinterher.
  void assembleBrief(taskId, undefined, (event) => sink.push(event))
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
