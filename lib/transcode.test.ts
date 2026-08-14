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

test("H.264-MOV wird nur umgepackt, nicht neu kodiert", () => {
  expect(planConversion({ container: MOV, video: "avc", audio: "aac" })).toBe("remux");
  expect(planConversion({ container: MOV, video: "avc", audio: null })).toBe("remux");
});

// Das ist der Fall, der die Uploads hat scheitern lassen.
test("HEVC und ProRes müssen neu kodiert werden – egal in welchem Container", () => {
  expect(planConversion({ container: MOV, video: "hevc", audio: "aac" })).toBe("transcode");
  expect(planConversion({ container: MOV, video: "prores", audio: "pcm-s16" })).toBe("transcode");
  // Der Container allein sagt nichts: ein MP4 mit HEVC scheitert genauso.
  expect(planConversion({ container: "MP4", video: "hevc", audio: "aac" })).toBe("transcode");
});

test("Falscher Ton reicht schon", () => {
  expect(planConversion({ container: "MP4", video: "avc", audio: "opus" })).toBe("transcode");
  expect(planConversion({ container: "MP4", video: "avc", audio: "pcm-s16" })).toBe("transcode");
});

test("Fremde Container gehen den normalen Weg", () => {
  expect(planConversion({ container: "Matroska", video: "avc", audio: "aac" })).toBe("remux");
  expect(planConversion({ container: "WebM", video: "vp9", audio: "opus" })).toBe("transcode");
});

/**
 * Der zweite Fall, an dem Uploads gescheitert sind: "Kopie von Rundflug
 * Außen.mp4" – H.264 in MP4, also nach Codec-Regel ein Durchreicher, aber
 * 20 Mbit/s auf 75 Sekunden = 187 MB. Graph antwortet darauf mit 413, bzw. die
 * Verbindung fällt vorher. Der Codec allein sagt eben nicht, ob die Datei geht.
 */
test("richtiger Codec, trotzdem zu fett: wird neu kodiert", () => {
  expect(
    planConversion({
      container: "MP4",
      video: "avc",
      audio: "aac",
      bitrate: 20_077_949,
      width: 1920,
      height: 1080,
    }),
  ).toBe("transcode");
  // Auch 4K bei braver Bitrate – Meta rechnet ohnehin auf 1080p herunter.
  expect(
    planConversion({ container: "MP4", video: "avc", audio: "aac", bitrate: 6e6, width: 3840, height: 2160 }),
  ).toBe("transcode");
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
