/**
 * Videos Meta-tauglich machen – im Browser, bevor sie hochgeladen werden.
 *
 * Probe vom 2026-09-04 (drei echte UGC-Clips aus dem Drive, direkt per API ins
 * Werbekonto): Meta nimmt HEVC in MOV *und* MP4 an, auch 4K HDR mit 54 Mbit/s
 * und 176 MB – Status „ready“, vier Renditionen. Die Annahme aus der Spec vom
 * 2026-08-13, HEVC werde abgelehnt, war nie geprüft und ist falsch. Umgewandelt
 * wird deshalb nur noch, was Meta nachweislich nicht nimmt oder für Instagram
 * verwirft: fremde Codecs (ProRes, VP9, Opus) und zu kleine Bilder.
 */

/** H.264 heißt bei mediabunny "avc". */
const META_VIDEO = "avc";
const META_AUDIO = "aac";
/** Was Meta unverändert nimmt – geprüft, nicht gelesen. */
const ACCEPTED_VIDEO = new Set(["avc", "hevc"]);

/**
 * Metas eigene Empfehlung für 1080p – und die Grenze, ab der Uploads kippen:
 * ein 75-Sekünder mit 20 Mbit/s ist 187 MB, und darauf antwortet Graph mit 413,
 * wenn die Verbindung nicht schon vorher abreißt. Höher aufzulösen bringt auch
 * nichts: Meta kodiert jedes Video ohnehin selbst neu.
 */
const MAX_BITRATE = 8_000_000;
const MAX_EDGE = 1920;

/**
 * Instagrams Minimum: unter 500 Pixel Breite lehnt Meta das Video für
 * Instagram-Platzierungen ab (Feed 500×500, Story/Reel 500×888) – erst nach
 * dem Upload, mit einer Fehlermeldung am fertigen Anzeigenentwurf. Zu kleine
 * Videos werden deshalb vorher auf HD hochskaliert: Schärfe kommt dabei keine
 * dazu, aber verloren geht auch nichts – und Meta nimmt sie an.
 */
const MIN_EDGE = 500;
/** Worauf hochskaliert wird: kurze Kante 1080, lange gedeckelt bei MAX_EDGE. */
const HD_EDGE = 1080;

export type Action = "passthrough" | "transcode";

export type Probe = {
  /** Container-Name laut mediabunny, z. B. "MP4" oder "QuickTime File Format". */
  container: string;
  video: string | null;
  audio: string | null;
  /** Bits pro Sekunde der Videospur, wo messbar. */
  bitrate?: number;
  /** Anzeigemaße nach Rotation, wo bekannt. */
  width?: number;
  height?: number;
};

/**
 * Der einzige Teil mit einer Entscheidung drin – und der einzige, der sich ohne
 * WebCodecs testen lässt.
 */
export function planConversion(probe: Probe): Action {
  const { video, audio } = probe;
  if (video === null || !ACCEPTED_VIDEO.has(video)) return "transcode";
  // Kein Ton ist in Ordnung; Autoplay läuft ohnehin stumm.
  if (audio !== null && audio !== META_AUDIO) return "transcode";
  // Unter Instagrams Minimum hilft nur Hochskalieren, und das heißt neu kodieren.
  // Bitrate und 4K sind kein Grund mehr: Meta rechnet selbst herunter, und seit
  // dem stückweisen Upload (lib/uploads.ts) reißt auch 176 MB nichts mehr ab.
  if (tooSmall(probe)) return "transcode";
  return "passthrough";
}

/** Unter Instagrams Minimum – nur bei bekannten Maßen, geraten wird nicht. */
export function tooSmall({ width, height }: Probe): boolean {
  return !!width && !!height && Math.min(width, height) < MIN_EDGE;
}

/** Was am Encoder eingestellt wird. Leer heißt: nimm, was mediabunny vorschlägt. */
export type Target = { bitrate?: number; width?: number; height?: number };

/**
 * Gedeckelt wird, nicht gesetzt: ein sparsames HEVC soll beim Umkodieren nicht
 * auf 8 Mbit/s aufgeblasen werden, nur weil es umkodiert werden muss.
 *
 * Gerundet wird, weil computePacketStats() misst statt abzulesen: die Bitrate
 * kommt als Bruch heraus (8 · Bytes / Dauer), und mb.Quality nimmt nur ganze
 * Zahlen ("options.bitrate, when provided, must be a positive integer"). Das
 * traf genau die Videos, die *unter* der Decke liegen – über ihr steht mit
 * MAX_BITRATE ohnehin eine ganze Zahl, deshalb ging es meistens gut.
 */
export function encodeTarget({ bitrate, width, height }: Probe): Target {
  const target: Target = {};
  if (bitrate !== undefined) target.bitrate = Math.round(Math.min(bitrate, MAX_BITRATE));
  if (width && height && Math.max(width, height) > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(width, height);
    target.width = even(width * scale);
    target.height = even(height * scale);
  } else if (width && height && Math.min(width, height) < MIN_EDGE) {
    // Hochskalieren auf HD: kurze Kante Richtung 1080, lange Kante nie über
    // MAX_EDGE hinaus. Die Quell-Bitrate wäre für die vervielfachte Fläche
    // viel zu knapp und ergäbe Matsch – der Encoder wählt selbst.
    const scale = Math.min(HD_EDGE / Math.min(width, height), MAX_EDGE / Math.max(width, height));
    target.width = even(width * scale);
    target.height = even(height * scale);
    delete target.bitrate;
  }
  return target;
}

// H.264 kann keine ungeraden Kantenlängen.
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export type Converted = {
  file: File;
  action: Action;
  /** Gesetzt, wenn bewusst nicht umgewandelt wurde, obwohl es nötig gewesen wäre. */
  note?: string;
};

const REASONS: Record<string, string> = {
  unknown_source_codec: "the codec could not be identified",
  undecodable_source_codec: "this browser cannot decode the codec",
  no_encodable_target_codec: "this browser cannot encode H.264/AAC",
};

/**
 * Gibt die Datei zurück, die hochgeladen werden soll – umgewandelt, wenn nötig.
 * `onProgress` läuft von 0 bis 1 und nur während einer echten Umwandlung.
 *
 * `beforeWork` wird genau einmal aufgerufen: nachdem feststeht, dass diese Datei
 * wirklich umgewandelt werden muss, und bevor damit angefangen wird. Wer viele
 * Dateien gleichzeitig hierher schickt, kann an dieser Stelle einen Encoder-
 * Platz abwarten – ohne dass das Prüfen davor (billig, ein paar Packets lesen)
 * mit in die Warteschlange gerät. Genau darum steht der Haken hier drin und
 * nicht um den ganzen Aufruf herum.
 */
export async function toMetaReady(
  file: File,
  onProgress?: (progress: number) => void,
  beforeWork?: () => Promise<void> | void,
): Promise<Converted> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });

  const [format, videoTrack, audioTrack] = await Promise.all([
    input.getFormat(),
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
  ]);

  if (!videoTrack) throw new Error("no video track – Meta needs a video for this ad");

  const [videoCodec, audioCodec, width, height, stats] = await Promise.all([
    videoTrack.getCodec(),
    audioTrack?.getCodec() ?? Promise.resolve(null),
    // Anzeigemaße, nicht kodierte: ein hochkant gedrehtes Video ist sonst quer.
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    // Über die ersten 200 Packets gemittelt. Die ganze Datei zu scannen dauert
    // bei 187 MB länger als die Entscheidung wert ist, und der Schnitt reicht,
    // um 20 Mbit/s von 6 zu unterscheiden.
    videoTrack.computePacketStats(200).catch(() => undefined),
  ]);

  const probe: Probe = {
    container: format.name,
    video: videoCodec,
    audio: audioCodec,
    bitrate: stats?.averageBitrate,
    width,
    height,
  };
  const action = planConversion(probe);
  if (action === "passthrough") return { file, action };
  await beforeWork?.();
  const target = encodeTarget(probe);

  // ProRes kennt WebCodecs nicht, der Decoder kommt aus dem Zusatzpaket.
  if (videoCodec === "prores") {
    const { registerProresDecoder } = await import("@mediabunny/prores");
    registerProresDecoder();
  }
  // Nur registrieren, wenn der Browser es nicht selbst kann – sonst verdrängt
  // der Polyfill den nativen (schnelleren) Encoder.
  if (audioTrack && !(await mb.canEncodeAudio(META_AUDIO))) {
    const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
    registerAacEncoder();
  }

  const blocker = await cannotHandle(mb, videoTrack, target);
  // Lieber das Original hochladen als den Upload zu verweigern: bisher ging
  // die Datei ja auch unverändert raus. Ein zu kleines Video wird Meta für
  // Instagram allerdings ablehnen – das steht dann dran, statt später als
  // Rätsel im Anzeigenentwurf aufzutauchen.
  if (blocker)
    return {
      file,
      action: "passthrough",
      note: tooSmall(probe)
        ? `Auflösung unter Instagrams Minimum (${MIN_EDGE} px), Hochskalieren nicht möglich – ${blocker}`
        : blocker,
    };

  const output = new mb.Output({
    format: new mb.Mp4OutputFormat(),
    target: new mb.BufferTarget(),
  });

  // Die Zielcodecs müssen ausdrücklich dastehen. Sonst kopiert mediabunny die
  // Packets einfach ins MP4 – und MP4 *darf* HEVC enthalten, also käme genau
  // das wieder heraus, was Meta ablehnt. Passt der Codec schon, wird trotzdem
  // kopiert statt neu kodiert; erzwungen wird nur das Ziel, nicht der Weg.
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: {
      codec: META_VIDEO,
      ...(target.bitrate ? { quality: new mb.Quality({ bitrate: target.bitrate }) } : {}),
      ...(target.width && target.height
        ? { width: target.width, height: target.height, fit: "contain" as const }
        : {}),
    },
    audio: { codec: META_AUDIO },
  });
  if (!conversion.isValid) {
    const reason = conversion.discardedTracks
      .map((t) => REASONS[t.reason])
      .find(Boolean);
    throw new Error(`cannot be converted – ${reason ?? "no usable video track remained"}`);
  }
  if (onProgress) conversion.onProgress = (progress) => onProgress(progress);
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("conversion produced no data");

  return {
    file: new File([buffer], mp4Name(file.name), { type: "video/mp4" }),
    action,
  };
}

async function cannotHandle(
  mb: typeof import("mediabunny"),
  track: import("mediabunny").InputVideoTrack,
  target: Target,
): Promise<string | undefined> {
  const codec = await track.getCodec();
  if (!(await track.canDecode())) return `this browser cannot decode ${codec ?? "the video"}`;
  // Gefragt wird nach der Größe, die herauskommen soll: 4K kann mancher Encoder
  // nicht, das daraus gerechnete 1080p schon.
  const [width, height] = await Promise.all([
    target.width ?? track.getCodedWidth(),
    target.height ?? track.getCodedHeight(),
  ]);
  if (!(await mb.canEncodeVideo(META_VIDEO, { width, height })))
    return "this browser cannot encode H.264";
  return undefined;
}

const mp4Name = (name: string) => `${name.replace(/\.[^./\\]+$/, "")}.mp4`;
