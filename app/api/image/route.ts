/**
 * Ein hochgeladenes Bild wieder sichtbar machen. Meta gibt beim Upload nur einen
 * Hash zurück; die Adresse dazu steht in `/adimages` und zeigt auf ein CDN, das
 * die App nicht kontrolliert.
 *
 * Deshalb der Umweg über den eigenen Server: erstens braucht das CDN einen
 * Token, den der Browser nicht bekommt, zweitens liest der Zuschnitt die Pixel
 * über ein <canvas> – und ein Bild von fremder Herkunft macht das Canvas
 * "tainted", danach gibt es keine Datei mehr heraus. Über die eigene Adresse
 * ausgeliefert ist es gleicher Ursprung und der Zuschnitt funktioniert.
 *
 * Der Client schickt nie eine URL, nur den Hash – die Adresse kommt aus Graph.
 * Sonst wäre das hier ein offener Weiterleiter in fremde Netze.
 */
import { imageUrl } from "@/lib/uploads";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const hash = params.get("hash");
  const adAccount = params.get("adAccount");
  if (!hash || !adAccount)
    return Response.json({ error: "hash und adAccount fehlen." }, { status: 400 });

  try {
    const url = await imageUrl(hash, adAccount);
    if (!url) return Response.json({ error: "Bild nicht gefunden." }, { status: 404 });

    const upstream = await fetch(url);
    if (!upstream.ok || !upstream.body)
      return Response.json({ error: `Bild nicht abrufbar (${upstream.status}).` }, { status: 502 });

    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        // Der Hash ist der Inhalt: dasselbe Bild kommt nie unter zwei Hashes
        // und ein Hash nie mit zwei Bildern. Damit ist ewiges Cachen richtig.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
