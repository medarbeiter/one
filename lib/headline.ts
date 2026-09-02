/**
 * Die Überschrift eines Werbemotivs, aus den Pixeln gelesen. Ein PDF-Export
 * heißt „page-1“ bis „page-12“, und die beiden Hälften einer Anzeige teilen
 * sich weder Namen noch Bildausschnitt – nur den Text. Läuft nur auf dem Server.
 *
 * Nie ein Fehler: ohne Überschrift greift in lib/media.ts die nächste Regel,
 * ein Upload scheitert daran nicht.
 */
import { mistral } from "./bodies";

// ponytail: small statt pixtral-large – Überschrift lesen ist keine Kunst,
// und die Datei kommt schon als 512-px-JPEG vom Client (previewOf in
// upload-queue.tsx).
const MODEL = "mistral-small-latest";

const PROMPT =
  "Das ist ein Werbemotiv. Gib nur die größte Überschrift (den Haupttext) wörtlich zurück, " +
  "ohne Anführungszeichen, ohne Erklärung. Kleingedrucktes, Buttons, Logos und Ortsnamen ignorieren. " +
  "Ist keine Überschrift zu lesen, antworte mit einem einzelnen Minus.";

export async function readHeadline(preview: Blob): Promise<string | undefined> {
  try {
    const base64 = Buffer.from(await preview.arrayBuffer()).toString("base64");
    const text = await mistral(
      [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: `data:${preview.type || "image/jpeg"};base64,${base64}` },
      ],
      { model: MODEL, temperature: 0 },
    );
    const line = text.trim().split("\n")[0]?.replace(/^["„“']+|["“”']+$/g, "").trim();
    return line && line !== "-" ? line : undefined;
  } catch (e) {
    console.warn("Überschrift nicht lesbar:", (e as Error).message);
    return undefined;
  }
}
