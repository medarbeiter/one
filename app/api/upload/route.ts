/**
 * Ein Upload pro Request. Bewusst ein Route Handler und keine Server Action:
 * Next schickt Actions pro Client streng nacheinander, damit würde jedes
 * Video das nächste blockieren – bei UGC-Batches minutenlang.
 */
import { readHeadline } from "@/lib/headline";
import { uploadImage, uploadVideo, videoThumbnail } from "@/lib/uploads";

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
