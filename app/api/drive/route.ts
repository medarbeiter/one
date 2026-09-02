/**
 * Drei Fragen an Drive, alle nur lesend (lib/drive.ts):
 *   ?q=<Kundenname>  → passende Kundenordner, der wahrscheinlichste schon geöffnet
 *   ?folder=<id>     → Inhalt eines Ordners (Unterordner und Medien) – zum Korrigieren
 *   ?thumb=<id>      → Drives Vorschaubild dazu, ebenso durchgereicht
 *   ?file=<id>       → die Datei selbst, durchgereicht als Strom
 *
 * Der Umweg über den Server, weil nur er den Dienstkonto-Schlüssel hat; der
 * Browser reiht das Ergebnis dann wie eine lokal gewählte Datei ein. Angemeldet
 * sein prüft proxy.ts für alles unter /api.
 */
import { bestLanding, download, entriesOf, findFolders, thumbnail, type DriveFile, type Landing } from "@/lib/drive";

export type DriveSearch = { folders: DriveFile[]; landed: Landing | null };
export type DriveFolder = { entries: DriveFile[] };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const file = url.searchParams.get("file");
  const folder = url.searchParams.get("folder");
  const thumb = url.searchParams.get("thumb");
  const q = url.searchParams.get("q")?.trim();

  try {
    if (file) {
      const upstream = await download(file);
      return new Response(upstream.body, {
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
          ...(upstream.headers.get("content-length") && {
            "content-length": upstream.headers.get("content-length")!,
          }),
          "cache-control": "no-store",
        },
      });
    }
    if (thumb) {
      const upstream = await thumbnail(thumb);
      if (!upstream) return new Response(null, { status: 404 });
      return new Response(upstream.body, {
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
          // Vorschaubilder ändern sich nicht; der Browser darf sie eine Weile behalten.
          "cache-control": "private, max-age=3600",
        },
      });
    }
    if (folder) return Response.json({ entries: await entriesOf(folder) } satisfies DriveFolder);
    if (!q) return Response.json({ error: "Kein Suchbegriff." }, { status: 400 });

    return Response.json((await bestLanding(await findFolders(q))) satisfies DriveSearch);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
