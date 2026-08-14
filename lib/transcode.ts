/**
 * Videos Meta-tauglich machen – im Browser, bevor sie hochgeladen werden.
 *
 * Meta nimmt MP4 *und* MOV als Container an. Abgelehnt wird, was drinsteckt:
 * HEVC (seit iOS 11 die Standardaufnahme des iPhones) und ProRes (was
 * Schnittprogramme in ein .mov exportieren). Entschieden wird deshalb nach
 * Codec, nicht nach Dateiendung – ein .mov mit H.264 läuft längst durch, ein
 * .mp4 mit HEVC nicht.
 */

/** H.264 heißt bei mediabunny "avc". */
const META_VIDEO = "avc";
const META_AUDIO = "aac";

/**
 * Metas eigene Empfehlung für 1080p – und die Grenze, ab der Uploads kippen:
 * ein 75-Sekünder mit 20 Mbit/s ist 187 MB, und darauf antwortet Graph mit 413,
 * wenn die Verbindung nicht schon vorher abreißt. Höher aufzulösen bringt auch
 * nichts: Meta kodiert jedes Video ohnehin selbst neu.
 */
const MAX_BITRATE = 8_000_000;
const MAX_EDGE = 1920;

export type Action = "passthrough" | "remux" | "transcode";

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
  const { container, video, audio } = probe;
  if (video !== META_VIDEO) return "transcode";
  // Kein Ton ist in Ordnung; Autoplay läuft ohnehin stumm.
  if (audio !== null && audio !== META_AUDIO) return "transcode";
  // Der Codec kann stimmen und die Datei trotzdem nicht hochgehen. Eine Drohnen-
  // aufnahme ist H.264 in MP4 – und mit 20 Mbit/s zu groß für einen Upload.
  if (tooBig(probe)) return "transcode";
  // MOV nähme Meta zwar an, aber Apple legt Edit-Lists hinein, die die Spec
  // ausdrücklich ausschließt. Der Containerwechsel schreibt sie weg und kostet
  // fast nichts: die Packets werden kopiert, nicht neu kodiert.
  return container === "MP4" ? "passthrough" : "remux";
}

/** Unbekannte Maße gelten als in Ordnung – geraten wird nicht. */
function tooBig({ bitrate, width, height }: Probe): boolean {
  if (bitrate !== undefined && bitrate > MAX_BITRATE) return true;
  return Math.max(width ?? 0, height ?? 0) > MAX_EDGE;
}

/** Was am Encoder eingestellt wird. Leer heißt: nimm, was mediabunny vorschlägt. */
export type Target = { bitrate?: number; width?: number; height?: number };

/**
 * Gedeckelt wird, nicht gesetzt: ein sparsames HEVC soll beim Umkodieren nicht
 * auf 8 Mbit/s aufgeblasen werden, nur weil es umkodiert werden muss.
 */
export function encodeTarget({ bitrate, width, height }: Probe): Target {
  const target: Target = {};
  if (bitrate !== undefined) target.bitrate = Math.min(bitrate, MAX_BITRATE);
  if (width && height && Math.max(width, height) > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(width, height);
    target.width = even(width * scale);
    target.height = even(height * scale);
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

  // Ein Remux kopiert nur Packets – dafür braucht der Browser den Codec nicht
  // zu beherrschen. Geprüft wird deshalb erst vor einer echten Umwandlung.
  if (action === "transcode") {
    const blocker = await cannotHandle(mb, videoTrack, target);
    // Lieber das Original hochladen als den Upload zu verweigern: bisher ging
    // die Datei ja auch unverändert raus.
    if (blocker) return { file, action: "passthrough", note: blocker };
  }

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
      // Nur beim echten Umkodieren: ein Remux soll ein Remux bleiben, und
      // Größe wie Bitrate wären dort ohnehin nur zu erreichen, indem jedes
      // Bild neu berechnet wird.
      ...(action === "transcode"
        ? {
            ...(target.bitrate ? { quality: new mb.Quality({ bitrate: target.bitrate }) } : {}),
            ...(target.width && target.height
              ? { width: target.width, height: target.height, fit: "contain" as const }
              : {}),
          }
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
