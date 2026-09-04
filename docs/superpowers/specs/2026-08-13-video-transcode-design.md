# Videos browserseitig Meta-tauglich machen

Stand 2026-08-13. Betrifft `/campaigns/new`, Schritt 2 „Ad sets".

> **Überholt am 2026-09-04.** Die Annahme unten – Meta lehne HEVC ab – war nie
> geprüft und ist falsch. Drei echte UGC-Clips direkt per API ins Werbekonto:
> HEVC in MOV (22 MB), HEVC 1080p (61 MB) und 4K HDR HEVC mit 54 Mbit/s
> (176 MB, stückweise) – alle „ready“ mit vier Renditionen. `planConversion`
> lässt HEVC und MOV deshalb durch; umgewandelt wird nur noch, was Meta
> nachweislich nicht nimmt (ProRes, VP9/Opus) oder für Instagram verwirft
> (kurze Kante unter 500 px). Die Bitrate-Decke ist gefallen: seit dem
> stückweisen Upload reißt nichts mehr ab. Videos aus dem Drive-Regal gehen
> seither direkt vom Server zu Meta (Spec 2026-09-02, §6a) und berühren den
> Browser gar nicht mehr. Der Rest dieser Spec beschreibt den Weg, der bleibt,
> wenn der Server abwinkt.

## Problem

Videos werden als `.mov` hochgeladen und von Meta abgelehnt. Die naheliegende
Erklärung – „Meta kann kein MOV" – stimmt nicht: Meta akzeptiert **MP4 und MOV**
als Container. Abgelehnt wird, was *drin* steckt:

- **HEVC/H.265** – seit iOS 11 die Standardaufnahme des iPhones
- **ProRes** – was Schnittprogramme in ein `.mov` exportieren
- **HDR** (iPhone) – laut Meta nicht mit Publishing über die API kompatibel

Ein `.mov` mit H.264/AAC lädt heute schon problemlos hoch; ein `.mp4` mit HEVC
scheitert. Die Umwandlung muss deshalb am **Codec** ansetzen, nicht an der
Dateiendung.

Zweiter Punkt: Der Upload zeigt bis zum Schluss keinen Zustand. `waitForVideo()`
pollt Meta bis zu fünf Minuten – in dieser Zeit sieht die Seite aus wie hängen
geblieben.

## Entscheidung

Umwandlung **im Browser** mit [mediabunny](https://mediabunny.dev) (v1.53.1),
nicht auf dem Server.

Damit bleiben `app/api/upload/route.ts` und `lib/uploads.ts` unverändert. Kein
`@mediabunny/server`, kein natives `node-av`, kein `postinstall`, kein Eintrag in
`trustedDependencies`. Nur `mediabunny` (dependency-frei, tree-shakable) plus
zwei kleine Polyfill-Pakete.

Geprüfte Browser-Matrix:

| Anforderung | Status im Browser |
|---|---|
| `.mov` lesen, `.mp4` schreiben | Bibliothek selbst, ohne WebCodecs |
| H.264-`.mov` → `.mp4` | reines Packet-Kopieren, ganz ohne Codec-Support |
| HEVC dekodieren | Chrome ≥ 108, Hardware über VideoToolbox |
| H.264 kodieren | WebCodecs, Hardware auf macOS |
| ProRes dekodieren | `@mediabunny/prores` |
| AAC kodieren | nativ in Chrome, sonst `@mediabunny/aac-encoder` |

Kein `SharedArrayBuffer`, keine COOP/COEP-Header – anders als ffmpeg.wasm. Die
`next.config.ts` bleibt unangetastet.

Der Weg deckt alles ab: `launch()` in `lib/campaigns.ts`, das rohe `File`s
serverseitig hochlädt, wird nur noch vom Test benutzt. `actions.ts` nimmt
`lib/launch.ts`, und das bekommt fertige Video-IDs. Jeder echte Upload geht durch
den Browser.

### Verworfen

- **`ffmpeg-static`** – funktioniert, aber lädt beim Install ein Binary nach,
  braucht `trustedDependencies`, und ob VideoToolbox einkompiliert ist, ist nicht
  garantiert. Bleibt der Rückfallplan hinter derselben Schnittstelle.
- **`ffmpeg.wasm`** – verlangt Cross-Origin-Isolation und rechnet in Software.
  Gegen die Anforderung „höchstes Tempo".

## Umwandlung: `lib/transcode.ts`

```ts
toMetaReady(file: File, onProgress?: (p: number) => void):
  Promise<{ file: File; action: "passthrough" | "remux" | "transcode" }>
```

Drei Wege, je nachdem was in der Datei steckt:

| Eingang | Weg | Kosten |
|---|---|---|
| MP4 + H.264/AAC | `passthrough` – unangetastet | null |
| **`.mov` + H.264/AAC** | `remux` – Container-Wechsel, Packets kopiert | Sekunden, Bild identisch |
| HEVC / ProRes / HDR | `transcode` – echtes Neukodieren, hardwarebeschleunigt | der einzige langsame Fall |

`remux` und `transcode` macht dieselbe `Conversion`; mediabunny kopiert
Mediendaten von sich aus, wo es geht, und kodiert nur sonst neu. Die
Unterscheidung dient der Anzeige und der Entscheidung, ob überhaupt angefasst
wird.

Die Wahl trifft eine **reine Funktion** – Container plus Codecs rein, Weg raus.
Nur sie wird in `bun test` geprüft; WebCodecs gibt es dort nicht.

Kann der Browser die Datei nicht dekodieren oder H.264 nicht kodieren
(`canDecode()` / `canEncodeVideo()`), wird das Original hochgeladen wie bisher –
kein Rückschritt gegenüber heute, mit Hinweis an der Karte.

## Ladezustand: `app/campaigns/new/ad-set-block.tsx`

Statt eines globalen „Uploading…" eine **Karte je Datei**, sichtbar sobald die
Dateien gewählt sind:

```
Konvertieren zu MP4 · 42 %  →  Hochladen zu Meta…  →  Meta verarbeitet…  →  Thumbnail
```

Der Prozentwert kommt aus `Conversion.onProgress` (0–1). Die beiden anderen
Phasen sind unbestimmt, aber genau sie sehen heute wie ein Absturz aus.

Der Spinner ist eine CSS-Animation: die läuft im Compositor und dreht sich
weiter, auch wenn der Haupt-Thread beim Kodieren stockt. Deshalb zunächst kein
Web Worker – wenn die Messung echtes Ruckeln zeigt, ist der Umzug in einen Worker
eine gekapselte Änderung.

Fehler stehen an der betroffenen Karte statt gesammelt in einer Alert-Box.
Der parallele `Promise.allSettled`-Fächer bleibt.

## Zeichenlimit

`BODY_LIMIT` in `ad-set-block.tsx` von 1024 auf **4399**. Zähler und `maxLength`
lesen beide daraus.

## Tests

- **`bun test`**: die reine Entscheidungsfunktion, ohne WebCodecs.
- **Browser**: echte `.mov`-Datei durch den Wizard, Phasen und Ergebnis geprüft.
  Erst das beantwortet, ob HEVC oder ProRes der Auslöser war.

## Offene Risiken

- **HDR-Tone-Mapping ungeprüft.** iPhone-HDR → SDR H.264 kann ausgewaschen
  wirken. Vor dem Scharfschalten an echtem Material prüfen.
- **Dateigröße im Speicher.** `BufferTarget` hält das Ergebnis im RAM. Bei den
  konfigurierten 512 MB tragbar; darüber auf `StreamTarget` wechseln.
