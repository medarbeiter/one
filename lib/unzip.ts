/**
 * ZIP-Archive im Browser auspacken – nur die Medien, die der Upload ohnehin
 * annimmt. Kein zusätzliches Paket: das Zentralverzeichnis ist ein paar feste
 * Offsets, und das eigentliche Entpacken macht DecompressionStream. Gelesen
 * wird über File.slice, das Archiv liegt also nie ganz im Speicher – nur der
 * jeweils entpackte Eintrag, genau wie bei einer direkt gewählten Datei.
 */

// Der MIME-Typ steht nicht im ZIP – er kommt aus der Endung, denn Route
// Handler und Warteschlange entscheiden beide über file.type. HEIC/HEIF sind
// absichtlich dabei: der Route Handler lehnt sie mit dem hilfreichen
// "exportiere als JPEG"-Hinweis ab, stilles Verschwinden wäre schlechter.
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
};

/** Der Medien-MIME-Typ zu einem Eintragsnamen – undefined heißt: überspringen. */
function mediaType(name: string): string | undefined {
  // macOS legt in __MACOSX Ressourcen-Doubletten ab (._Creative 1.png) –
  // gleiche Endung, kein Bild.
  if (name.startsWith("__MACOSX/") || name.includes("/__MACOSX/")) return undefined;
  const base = name.split("/").pop() ?? "";
  if (base.startsWith(".")) return undefined;
  return TYPES[base.split(".").pop()?.toLowerCase() ?? ""];
}

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
// ponytail: kein ZIP64 – bei Archiven oder Einträgen über 4 GB stehen hier
// Platzhalter. Dann klar scheitern statt Müll entpacken; Ausbau: fflate.
const ZIP64 = 0xffffffff;
const TOO_BIG = "Das Archiv ist größer als 4 GB – bitte kleinere ZIPs hochladen.";

/**
 * Alle Bilder und Videos aus einem ZIP, als Dateien mit richtigem MIME-Typ
 * und ohne Ordnerpfad im Namen – die Nummern-Paarung ("Creative 3") arbeitet
 * mit dem Dateinamen, nicht mit dem Pfad. Wirft, wenn das Archiv unlesbar ist
 * oder kein einziges Medium enthält: still nichts zu tun sähe aus wie ein
 * verlorener Upload.
 */
export async function unzipMedia(zip: File): Promise<File[]> {
  // Das Ende des Zentralverzeichnisses steht am Dateiende, davor höchstens
  // 64 KB Archivkommentar – rückwärts nach der Signatur suchen.
  const tailStart = Math.max(0, zip.size - 65536 - 22);
  const tail = new DataView(await zip.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--)
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Keine lesbare ZIP-Datei.");

  const count = tail.getUint16(eocd + 10, true);
  const cdirSize = tail.getUint32(eocd + 12, true);
  const cdirOffset = tail.getUint32(eocd + 16, true);
  if (cdirOffset === ZIP64) throw new Error(TOO_BIG);

  const cdir = new DataView(await zip.slice(cdirOffset, cdirOffset + cdirSize).arrayBuffer());
  const files: File[] = [];
  let pos = 0;
  for (let i = 0; i < count && pos + 46 <= cdir.byteLength; i++) {
    if (cdir.getUint32(pos, true) !== CDIR_SIG) break;
    const flags = cdir.getUint16(pos + 8, true);
    const method = cdir.getUint16(pos + 10, true);
    const compressed = cdir.getUint32(pos + 20, true);
    const nameLen = cdir.getUint16(pos + 28, true);
    const extraLen = cdir.getUint16(pos + 30, true);
    const commentLen = cdir.getUint16(pos + 32, true);
    const localOffset = cdir.getUint32(pos + 42, true);
    // Bit 11 heißt UTF-8; sonst ist es historisch CP437 – latin1 ist die
    // nächste Näherung, die TextDecoder kennt, und betrifft nur Anzeigenamen.
    const name = new TextDecoder(flags & 0x800 ? "utf-8" : "latin1").decode(
      new Uint8Array(cdir.buffer, pos + 46, nameLen),
    );
    pos += 46 + nameLen + extraLen + commentLen;

    const type = mediaType(name);
    // Ordner, Nicht-Medien, Verschlüsseltes und exotische Methoden fallen weg;
    // 0 = unkomprimiert abgelegt, 8 = Deflate – mehr erzeugt heute niemand.
    if (!type || name.endsWith("/") || flags & 0x1 || (method !== 0 && method !== 8)) continue;
    if (compressed === ZIP64 || localOffset === ZIP64) throw new Error(TOO_BIG);

    // Die Längen im lokalen Header können vom Zentralverzeichnis abweichen
    // (macOS schreibt dort andere Extra-Felder) – die Daten beginnen hinter ihm.
    const local = new DataView(await zip.slice(localOffset, localOffset + 30).arrayBuffer());
    const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    const data = zip.slice(dataStart, dataStart + compressed);
    const blob =
      method === 8
        ? await new Response(
            data.stream().pipeThrough(new DecompressionStream("deflate-raw")),
          ).blob()
        : data;
    files.push(new File([blob], name.split("/").pop()!, { type }));
  }

  if (!files.length) throw new Error("Im Archiv stecken keine Bilder oder Videos.");
  return files;
}
