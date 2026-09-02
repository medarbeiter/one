/**
 * Drive-Dateien in den Browser holen, drei auf einmal – mehr hieße mehr Videos
 * zugleich im Speicher. Geteilt von Dialog und Regal; wer die Datei danach
 * bekommt, sieht ein gewöhnliches File-Objekt, wie vom Finder.
 */
import type { DriveFile } from "@/lib/drive";
import { createGate } from "@/lib/gate";

const DOWNLOAD_LANES = 3;

export async function fetchDriveFiles(
  wanted: DriveFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: File[]; failed: string[] }> {
  const gate = createGate(DOWNLOAD_LANES);
  const files: File[] = [];
  const failed: string[] = [];
  let done = 0;
  await Promise.all(
    wanted.map(async (m) => {
      await gate.acquire();
      try {
        const res = await fetch(`/api/drive?file=${encodeURIComponent(m.id)}`);
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        files.push(new File([await res.blob()], m.name, { type: m.mimeType }));
      } catch {
        failed.push(m.name);
      } finally {
        gate.release();
        onProgress?.(++done, wanted.length);
      }
    }),
  );
  return { files, failed };
}
