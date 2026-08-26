/**
 * Ein hochgeladenes Video abspielbar machen. Beim Upload entsteht nur eine
 * Video-ID; die Abspieladresse steht in Graph unter `source` und zeigt auf
 * Metas CDN – signiert und befristet, aber ohne Cookie oder Token abspielbar.
 *
 * Deshalb hier eine Weiterleitung statt eines Proxys: das CDN beherrscht
 * Range-Requests (Spulen im <video>), die durch einen eigenen Proxy erst
 * mühsam durchgereicht werden müssten. Der Client schickt nur die ID, nie
 * eine URL – sonst wäre das ein offener Weiterleiter.
 */
import { graph } from "@/lib/graph";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(id))
    return Response.json({ error: "id fehlt oder ist keine Video-ID." }, { status: 400 });

  try {
    // 5 Minuten gecacht – auf dem Server wie im Browser. Die CDN-Adresse ist
    // signiert und läuft nach Stunden ab, nicht nach Minuten; ohne Cache
    // kostete jedes Abspielen in der Vorschau einen frischen Graph-Read
    // (gr:get:Video stand damit ganz oben in Metas Rate-Limit-Statistik).
    const { source } = await graph<{ source?: string }>(id, {
      params: { fields: "source" },
      revalidate: 300,
      tags: ["video", `video:${id}`],
    });
    if (!source)
      return Response.json({ error: "Video noch nicht abrufbar." }, { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { location: source, "cache-control": "private, max-age=300" },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
