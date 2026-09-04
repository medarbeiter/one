/**
 * Drei Fragen an Drive, alle nur lesend (lib/drive.ts):
 *   ?q=<Kundenname>  → passende Kundenordner, der wahrscheinlichste schon geöffnet
 *   ?folder=<id>     → Inhalt eines Ordners (Unterordner und Medien) – zum Korrigieren
 *   ?thumb=<id>      → Drives Vorschaubild dazu, ebenso durchgereicht
 *   ?file=<id>       → die Datei selbst, durchgereicht als Strom (mit Range: zum Abspielen)
 *   ?land=<Ordner-ID> → wie ?q=, aber ab einem bekannten Ordner (Drive-Link aus ClickUp)
 *   &hint=Renningen,FK → Ort und Rollen der Aufgabe: wählen unter datierten Unterordnern
 *
 * Der Umweg über den Server, weil nur er den Dienstkonto-Schlüssel hat; der
 * Browser reiht das Ergebnis dann wie eine lokal gewählte Datei ein. Angemeldet
 * sein prüft proxy.ts für alles unter /api.
 */
import { bestLanding, download, entriesOf, findFolders, landingAt, thumbnail, type DriveFile, type Landing } from "@/lib/drive";

export type DriveSearch = { folders: DriveFile[]; landed: Landing | null };
export type DriveFolder = { entries: DriveFile[] };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const file = url.searchParams.get("file");
  const folder = url.searchParams.get("folder");
  const thumb = url.searchParams.get("thumb");
  const land = url.searchParams.get("land");
  const q = url.searchParams.get("q")?.trim();
  const hint = (url.searchParams.get("hint") ?? "").split(",").map((h) => h.trim()).filter(Boolean);

  try {
    if (file) {
      const upstream = await download(file, request.headers.get("range") ?? undefined);
      const passed = ["content-type", "content-length", "content-range", "accept-ranges"] as const;
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": "application/octet-stream",
          // Drive sagt es beim vollen Abruf nicht dazu – <video> spult nur, wenn es dasteht.
          "accept-ranges": "bytes",
          ...Object.fromEntries(passed.flatMap((h) => (upstream.headers.get(h) ? [[h, upstream.headers.get(h)!]] : []))),
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
    if (land) return Response.json({ folders: [], landed: await landingAt(land, hint) } satisfies DriveSearch);
    if (folder) return Response.json({ entries: await entriesOf(folder) } satisfies DriveFolder);
    if (!q) return Response.json({ error: "Kein Suchbegriff." }, { status: 400 });

    return Response.json((await bestLanding(await findFolders(q), undefined, hint)) satisfies DriveSearch);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
