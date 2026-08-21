import { suche } from "@/lib/suche";

/**
 * Die eine Adresse der Suche. Dünn mit Absicht: der Zuschnitt steht in
 * lib/suche.ts, hier wird nur die Frage aus der Adresse gelesen.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const treffer = await suche(params.get("q") ?? "", params.get("bereich") ?? undefined);
  return Response.json(treffer);
}
