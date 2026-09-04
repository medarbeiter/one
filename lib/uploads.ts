/**
 * Upload von Bildern und Videos ins Werbekonto. Getrennt von campaigns.ts,
 * weil der Route Handler das hier braucht, aber keine Kampagnen-Reads.
 */
import { graph, meta } from "./graph";

export async function uploadImage(
  file: File,
  acct = meta.adAccount,
): Promise<string> {
  const fd = new FormData();
  fd.append(file.name, file);
  const r = await graph<{ images: Record<string, { hash: string }> }>(
    `${acct}/adimages`,
    { method: "POST", body: fd },
  );
  return Object.values(r.images)[0].hash;
}

/**
 * Die Adresse zu einem Bild-Hash. Meta gibt sie beim Upload zwar mit zurück,
 * aber sie läuft nach Stunden ab – ein wiederhergestellter Entwurf hätte dann
 * lauter kaputte Vorschauen. Frisch geholt gilt sie wieder.
 */
export async function imageUrl(hash: string, acct = meta.adAccount): Promise<string | undefined> {
  const { data } = await graph<{ data: { hash: string; url: string }[] }>(`${acct}/adimages`, {
    params: { hashes: [hash], fields: "hash,url" },
    revalidate: 300,
    tags: ["adimages", `adimage:${hash}`],
  });
  return data?.find((i) => i.hash === hash)?.url ?? data?.[0]?.url;
}

/**
 * Ab hier geht das Video in Stücken hoch. Ein einzelner POST mit 187 MB endete
 * bei Graph in "413" oder in einer Verbindung, die mittendrin abriss – und
 * gedrehtes Material ist schnell so groß, auch schon heruntergerechnet.
 */
export const CHUNKED_ABOVE = 50 * 1024 * 1024;

/**
 * Woher die Bytes kommen: eine Datei im Speicher oder – beim Direktweg von
 * Drive – ein Range-Request je Stück. Meta sagt die Offsets, die Quelle
 * liefert genau die; ganz im Speicher liegt das Video so nie.
 */
export type VideoSource = {
  name: string;
  size: number;
  /** Bytes from..to, to exklusiv. */
  read: (from: number, to: number) => Promise<Blob>;
};

const fromFile = (file: File): VideoSource => ({
  name: file.name,
  size: file.size,
  read: async (from, to) => file.slice(from, to),
});

/** `onProgress` läuft 0–1 über die Bytes; die 1 heißt: alles drüben, Meta verarbeitet. */
export async function uploadVideo(
  file: File | VideoSource,
  acct = meta.adAccount,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const src = file instanceof File ? fromFile(file) : file;
  const id = src.size > CHUNKED_ABOVE ? await inChunks(src, acct, onProgress) : await inOnePiece(src, acct);
  onProgress?.(1);
  await waitForVideo(id);
  return id;
}

async function inOnePiece(src: VideoSource, acct: string): Promise<string> {
  const fd = new FormData();
  fd.append("source", await src.read(0, src.size), src.name);
  const { id } = await graph<{ id: string }>(`${acct}/advideos`, {
    method: "POST",
    body: fd,
  });
  return id;
}

type Session = {
  video_id: string;
  upload_session_id: string;
  start_offset: string;
  end_offset: string;
};

/**
 * Metas Stückweise-Protokoll: start nennt die Sitzung, jede Antwort sagt, welches
 * Stück als Nächstes drankommt, finish schließt ab. Die Stückgröße gibt Meta vor
 * – wir rechnen sie nicht aus, wir folgen den Offsets.
 */
async function inChunks(src: VideoSource, acct: string, onProgress?: (progress: number) => void): Promise<string> {
  const session = await phase<Session>(acct, {
    upload_phase: "start",
    file_size: String(src.size),
  });

  let { start_offset: from, end_offset: to } = session;
  while (from !== to) {
    const next = await phase<{ start_offset: string; end_offset: string }>(
      acct,
      {
        upload_phase: "transfer",
        upload_session_id: session.upload_session_id,
        start_offset: from,
      },
      await src.read(Number(from), Number(to)),
      src.name,
    );
    // Ohne diese Prüfung liefe ein Offset, der stehen bleibt, endlos – und der
    // Upload sähe von außen nur aus, als hinge er.
    if (next.start_offset === from)
      throw new Error(`Upload kam nicht voran (Offset ${from} von ${src.size})`);
    onProgress?.(Number(to) / src.size);
    ({ start_offset: from, end_offset: to } = next);
  }

  await phase(acct, {
    upload_phase: "finish",
    upload_session_id: session.upload_session_id,
  });
  return session.video_id;
}

function phase<T = unknown>(
  acct: string,
  fields: Record<string, string>,
  chunk?: Blob,
  name?: string,
): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (chunk) fd.append("video_file_chunk", chunk, name);
  return graph<T>(`${acct}/advideos`, { method: "POST", body: fd });
}

// ponytail: Polling mit wachsendem Abstand (5s → 30s), Decke bei ~5 Min. Das
// feste 5s-Raster stand mit ~60 Status-Reads je Video ganz oben in Metas
// Rate-Limit-Statistik; so sind es höchstens ~14. Erst auf Job-Queue umbauen,
// wenn Videos regelmäßig länger encodieren oder mehrere parallel hochladen.
async function waitForVideo(id: string, timeoutMs = 5 * 60_000) {
  const started = Date.now();
  for (let delay = 5000; ; delay = Math.min(delay * 1.5, 30_000)) {
    const { status } = await graph<{ status: { video_status: string } }>(id, {
      params: { fields: "status" },
    });
    if (status?.video_status === "ready") return;
    if (status?.video_status === "error")
      throw new Error(`Video ${id}: processing failed`);
    if (Date.now() - started >= timeoutMs)
      throw new Error(`Video ${id} still not processed after 5 minutes`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

export async function videoThumbnail(videoId: string): Promise<string> {
  // Thumbnails eines fertigen Videos ändern sich nicht mehr – jeder Read
  // danach ist derselbe. Ein Tag gecacht; die Adresse ist signiert und hält.
  const { data } = await graph<{
    data: { uri: string; is_preferred: boolean }[];
  }>(`${videoId}/thumbnails`, { revalidate: 3600, tags: ["video"] });
  return (data.find((t) => t.is_preferred) ?? data[0]).uri;
}
