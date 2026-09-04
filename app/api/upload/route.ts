/**
 * Ein Upload pro Request. Bewusst ein Route Handler und keine Server Action:
 * Next schickt Actions pro Client streng nacheinander, damit würde jedes
 * Video das nächste blockieren – bei UGC-Batches minutenlang.
 *
 * Zwei Wege: eine Datei im Body (vom Rechner, oder aus Drive über den
 * Browser), oder `driveId` – dann holt der Server das Video stückweise aus
 * Drive und reicht es Meta weiter, ohne dass ein Byte durch den Browser geht.
 * Der Direktweg antwortet als NDJSON-Strom (DirectEvent), weil er Minuten
 * dauert und der Browser sonst nichts zu zeigen hätte.
 */
import { download, fileMeta } from "@/lib/drive";
import { readHeadline } from "@/lib/headline";
import { ndjsonSink } from "@/lib/ndjson";
import { uploadImage, uploadVideo, videoThumbnail, type VideoSource } from "@/lib/uploads";

export type DirectEvent =
  | { phase: "uploading"; progress: number }
  | { kind: "video"; id: string; thumbnail: string; width?: number; height?: number }
  /** Der Server kann nicht – der Browser soll die Datei holen und selbst umwandeln. */
  | { fallback: string }
  | { error: string };

/** Instagrams Minimum – dieselbe Zahl wie MIN_EDGE in lib/transcode.ts. */
const MIN_EDGE = 500;

function direct(driveId: string, adAccount: string): Response {
  const sink = ndjsonSink<DirectEvent>();
  void (async () => {
    const meta = await fileMeta(driveId);
    if (!meta.mimeType.startsWith("video/")) {
      sink.push({ fallback: "kein Video" });
      return;
    }
    const { width, height } = meta.videoMediaMetadata ?? {};
    // Zu klein nimmt Meta zwar an, verwirft es aber für Instagram – der
    // Browser skaliert hoch (lib/transcode.ts), der Server kann das nicht.
    if (width && height && Math.min(width, height) < MIN_EDGE) {
      sink.push({ fallback: `unter Instagrams Minimum (${MIN_EDGE} px)` });
      return;
    }
    const src: VideoSource = {
      name: meta.name,
      size: Number(meta.size),
      read: async (from, to) => (await download(driveId, { from, to })).blob(),
    };
    const id = await uploadVideo(src, adAccount, (progress) => sink.push({ phase: "uploading", progress }));
    sink.push({ kind: "video", id, thumbnail: await videoThumbnail(id), width, height });
  })()
    .catch((e: Error) => sink.push({ error: e.message }))
    .finally(() => sink.close());
  return new Response(sink.stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform" },
  });
}

// Nur diese beiden Bildformate nimmt Meta für Anzeigenbilder an. Vorher galt
// hier "alles, was kein Video ist, ist ein Bild" – eine HEIC aus dem iPhone
// wanderte damit erst nach dem Upload gegen eine Fehlermeldung von Meta, die
// nicht sagt, was zu tun ist. Die Prüfung vor dem Upload spart die Wartezeit
// und nennt den Ausweg.
const IMAGE_TYPES = ["image/jpeg", "image/png"];

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const adAccount = String(form.get("adAccount") ?? "");
  const driveId = String(form.get("driveId") ?? "");

  if (driveId && adAccount) return direct(driveId, adAccount);
  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "Keine Datei empfangen." }, { status: 400 });
  if (!adAccount)
    return Response.json({ error: "Kein Werbekonto angegeben." }, { status: 400 });

  const isVideo = file.type.startsWith("video/");
  if (!isVideo && !IMAGE_TYPES.includes(file.type)) {
    // Der Subtyp ist der Name, unter dem die Person die Datei kennt ("HEIC"),
    // der MIME-Typ ist es nicht.
    const label = file.type.split("/")[1]?.toUpperCase();
    return Response.json(
      {
        error: label
          ? `${label} wird nicht unterstützt — exportiere als JPEG oder PNG.`
          : "Dieser Dateityp wird nicht unterstützt — exportiere als JPEG oder PNG.",
      },
      { status: 400 },
    );
  }

  try {
    if (isVideo) {
      const id = await uploadVideo(file, adAccount);
      return Response.json({ kind: "video", id, thumbnail: await videoThumbnail(id) });
    }
    // Die Überschrift läuft neben dem Upload, nicht danach: Mistral braucht
    // Sekunden, und der Client wartet auf den Hash.
    const preview = form.get("preview");
    const [hash, headline] = await Promise.all([
      uploadImage(file, adAccount),
      preview instanceof Blob && preview.size > 0 ? readHeadline(preview) : undefined,
    ]);
    return Response.json({ kind: "image", hash, headline });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
