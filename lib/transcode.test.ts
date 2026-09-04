/**
 * Welcher Weg für welche Datei. Der Rest von transcode.ts braucht WebCodecs und
 * damit einen Browser – geprüft wird er dort (siehe Spec), hier nur die
 * Entscheidung, weil genau sie den Fehler verursacht hat: nach Endung statt
 * nach Codec zu gehen.
 */
import { expect, test } from "bun:test";
import { encodeTarget, planConversion } from "./transcode";

const MOV = "QuickTime File Format";

test("H.264-MP4 wird nicht angefasst", () => {
  expect(planConversion({ container: "MP4", video: "avc", audio: "aac" })).toBe("passthrough");
  // Kein Ton ist kein Grund zum Umkodieren – Autoplay läuft stumm.
  expect(planConversion({ container: "MP4", video: "avc", audio: null })).toBe("passthrough");
});

// Probe 2026-09-04: Meta nimmt MOV und HEVC unverändert – auch 4K HDR, 54 Mbit/s.
test("H.264-MOV und HEVC gehen unverändert hoch – egal in welchem Container", () => {
  expect(planConversion({ container: MOV, video: "avc", audio: "aac" })).toBe("passthrough");
  expect(planConversion({ container: MOV, video: "hevc", audio: "aac" })).toBe("passthrough");
  expect(planConversion({ container: "MP4", video: "hevc", audio: "aac" })).toBe("passthrough");
  expect(
    planConversion({ container: MOV, video: "hevc", audio: "aac", bitrate: 54e6, width: 2160, height: 3840 }),
  ).toBe("passthrough");
});

test("ProRes und Unbekanntes müssen neu kodiert werden", () => {
  expect(planConversion({ container: MOV, video: "prores", audio: "pcm-s16" })).toBe("transcode");
  expect(planConversion({ container: MOV, video: null, audio: "aac" })).toBe("transcode");
});

test("Falscher Ton reicht schon", () => {
  expect(planConversion({ container: "MP4", video: "avc", audio: "opus" })).toBe("transcode");
  expect(planConversion({ container: "MP4", video: "avc", audio: "pcm-s16" })).toBe("transcode");
});

test("Fremde Codecs gehen den normalen Weg", () => {
  expect(planConversion({ container: "WebM", video: "vp9", audio: "opus" })).toBe("transcode");
});

/**
 * "Kopie von Rundflug Außen.mp4" – 20 Mbit/s auf 75 Sekunden = 187 MB – scheiterte
 * einst mit 413 am einteiligen POST. Seit dem stückweisen Upload geht das durch
 * (Probe 2026-09-04: 176 MB, 54 Mbit/s, 4K). Bitrate ist kein Grund mehr.
 */
test("richtiger Codec, fett: bleibt unangetastet", () => {
  expect(
    planConversion({ container: "MP4", video: "avc", audio: "aac", bitrate: 20_077_949, width: 1920, height: 1080 }),
  ).toBe("passthrough");
  expect(
    planConversion({ container: "MP4", video: "avc", audio: "aac", bitrate: 6e6, width: 3840, height: 2160 }),
  ).toBe("passthrough");
});

test("was in den Rahmen passt, bleibt unangetastet", () => {
  expect(
    planConversion({ container: "MP4", video: "avc", audio: "aac", bitrate: 6e6, width: 1080, height: 1920 }),
  ).toBe("passthrough");
  // Nicht messbar heißt nicht zu groß: geraten wird nicht.
  expect(planConversion({ container: "MP4", video: "avc", audio: "aac" })).toBe("passthrough");
});

test("das Ziel deckelt, statt aufzublasen", () => {
  // Über der Decke wird gedeckelt …
  expect(encodeTarget({ container: "MP4", video: "avc", audio: "aac", bitrate: 20e6 })).toEqual({
    bitrate: 8_000_000,
  });
  // … darunter bleibt die Bitrate des Originals stehen. Ein sparsames HEVC
  // soll beim Umkodieren nicht künstlich aufgepumpt werden.
  expect(encodeTarget({ container: "MP4", video: "hevc", audio: "aac", bitrate: 3e6 })).toEqual({
    bitrate: 3_000_000,
  });
  expect(encodeTarget({ container: "MP4", video: "avc", audio: "aac" })).toEqual({});
});

/**
 * Der Fall aus „Tobi_PDL2“: gemessen, nicht abgelesen – und damit ein Bruch.
 * mb.Quality nimmt nur ganze Zahlen und warf sonst mitten im Upload
 * "options.bitrate, when provided, must be a positive integer".
 */
test("eine gemessene Bitrate wird ganzzahlig weitergereicht", () => {
  const { bitrate } = encodeTarget({
    container: MOV,
    video: "hevc",
    audio: "aac",
    bitrate: 5_234_567.891,
  });
  expect(bitrate).toBe(5_234_568);
  expect(Number.isInteger(bitrate!)).toBe(true);
  // Auch über der Decke, wo gedeckelt wird.
  expect(Number.isInteger(encodeTarget({ container: MOV, video: "hevc", audio: "aac", bitrate: 20_077_949.7 }).bitrate!)).toBe(true);
});

/**
 * Instagrams Minimum: unter 500 px Breite lehnt Meta das Video nach dem
 * Upload ab. Zu Kleines wird deshalb neu kodiert und auf HD hochskaliert.
 */
test("unter Instagrams Minimum wird neu kodiert", () => {
  expect(
    planConversion({ container: "MP4", video: "avc", audio: "aac", bitrate: 2e6, width: 480, height: 854 }),
  ).toBe("transcode");
  // Genau auf dem Minimum ist in Ordnung.
  expect(
    planConversion({ container: "MP4", video: "avc", audio: "aac", bitrate: 2e6, width: 500, height: 888 }),
  ).toBe("passthrough");
});

test("hochskaliert wird auf HD, ohne die geerbte Mini-Bitrate", () => {
  // 480×854 → kurze Kante Richtung 1080, lange Kante deckelt bei 1920.
  expect(
    encodeTarget({ container: "MP4", video: "avc", audio: "aac", bitrate: 800_000, width: 480, height: 854 }),
  ).toEqual({ width: 1080, height: 1920 });
  // Quadratisch: 1080×1080, die 1920-Decke greift nicht.
  expect(
    encodeTarget({ container: "MP4", video: "avc", audio: "aac", width: 400, height: 400 }),
  ).toEqual({ width: 1080, height: 1080 });
  // Ohne bekannte Maße wird nicht geraten und nicht skaliert.
  expect(encodeTarget({ container: "MP4", video: "hevc", audio: "aac", bitrate: 3e6 })).toEqual({
    bitrate: 3_000_000,
  });
});

test("herunterskaliert wird auf die lange Kante, im Seitenverhältnis", () => {
  expect(
    encodeTarget({ container: "MP4", video: "avc", audio: "aac", bitrate: 30e6, width: 3840, height: 2160 }),
  ).toEqual({ bitrate: 8_000_000, width: 1920, height: 1080 });
  // Hochformat: die lange Kante ist die Höhe.
  expect(
    encodeTarget({ container: "MP4", video: "avc", audio: "aac", width: 2160, height: 3840 }),
  ).toEqual({ width: 1080, height: 1920 });
  // H.264 kann keine ungeraden Kantenlängen.
  expect(
    encodeTarget({ container: "MP4", video: "avc", audio: "aac", width: 2560, height: 1441 }),
  ).toEqual({ width: 1920, height: 1080 });
});
