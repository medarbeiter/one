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

export async function uploadVideo(
  file: File,
  acct = meta.adAccount,
): Promise<string> {
  const fd = new FormData();
  fd.append("source", file);
  const { id } = await graph<{ id: string }>(`${acct}/advideos`, {
    method: "POST",
    body: fd,
  });
  await waitForVideo(id);
  return id;
}

// ponytail: 5s-Polling, Decke bei ~5 Min. Erst auf Job-Queue umbauen, wenn Videos
// regelmäßig länger encodieren oder mehrere parallel hochgeladen werden.
async function waitForVideo(id: string, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const { status } = await graph<{ status: { video_status: string } }>(id, {
      params: { fields: "status" },
    });
    if (status?.video_status === "ready") return;
    if (status?.video_status === "error")
      throw new Error(`Video ${id}: processing failed`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Video ${id} still not processed after 5 minutes`);
}

export async function videoThumbnail(videoId: string): Promise<string> {
  const { data } = await graph<{
    data: { uri: string; is_preferred: boolean }[];
  }>(`${videoId}/thumbnails`);
  return (data.find((t) => t.is_preferred) ?? data[0]).uri;
}
