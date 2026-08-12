/**
 * Ein Upload pro Request. Bewusst ein Route Handler und keine Server Action:
 * Next schickt Actions pro Client streng nacheinander, damit würde jedes
 * Video das nächste blockieren – bei UGC-Batches minutenlang.
 */
import { uploadImage, uploadVideo, videoThumbnail } from "@/lib/uploads";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const adAccount = String(form.get("adAccount") ?? "");

  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "No file received." }, { status: 400 });
  if (!adAccount)
    return Response.json({ error: "No ad account given." }, { status: 400 });

  try {
    if (file.type.startsWith("video/")) {
      const id = await uploadVideo(file, adAccount);
      return Response.json({ kind: "video", id, thumbnail: await videoThumbnail(id) });
    }
    return Response.json({ kind: "image", hash: await uploadImage(file, adAccount) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
