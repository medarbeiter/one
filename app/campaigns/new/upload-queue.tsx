"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useToast, type ShowToastFn } from "@astryxdesign/core";
import { ProgressRing } from "@/app/shell/progress-ring";
import { createConvoy, type Convoy } from "@/lib/convoy";
import { createGate } from "@/lib/gate";
import { orientationOf, type Orientation } from "@/lib/media";
import { toMetaReady } from "@/lib/transcode";
import type { WizardLooseAsset } from "./state";

/**
 * Die Uploads laufen außerhalb von React – und genau deshalb laufen sie weiter.
 *
 * Vorher hing der ganze Vorgang an der Anzeigengruppe, die ihn gestartet hatte.
 * Die steckt in einem Tab-Panel und in einem Aufklapper; beides hängt sie beim
 * Wechseln aus. Die Netzverbindung riss dadurch zwar nicht ab, aber der
 * Fortschritt war weg, und die fertige Datei rief in ein React-Element hinein,
 * das es nicht mehr gab: hochgeladen bei Meta, nicht im Entwurf. Wer während
 * eines Schwungs auf „Überprüfung“ klickte, verlor genau die Videos, auf die er
 * gewartet hatte.
 *
 * Hier liegt der Zustand deshalb im Modul: er überlebt jedes Aus- und Einhängen
 * und jeden Seitenwechsel innerhalb der Anwendung. Angemeldete Komponenten
 * zeichnen mit (useSyncExternalStore), fertige Dateien warten im Eingang, bis
 * der Assistent sie abholt – und was gerade läuft, steht als Toast da, auch wenn
 * überhaupt nichts davon zu sehen ist.
 */

/**
 * Wie viele Videos gleichzeitig umgewandelt werden.
 *
 * Zu beachten, falls jemand höher geht: jede laufende Umwandlung hält ihr
 * fertiges MP4 vollständig im Speicher (BufferTarget), bis der Upload durch ist.
 * Betroffen ist ohnehin nur, was Meta nicht annimmt (HEVC, ProRes, zu große
 * Bitraten); alles andere läuft ungebremst durch (planConversion →
 * "passthrough") und wartet auf nichts.
 */
const CONVERT_LANES = 6;

/**
 * So breit fährt ein Schwung zu Meta – genau so viele, wie zugleich umgewandelt
 * werden.
 *
 * Eine fertige Datei sofort einzeln loszuschicken wäre naheliegend, ergibt aber
 * ein Tröpfeln: die Umwandlungen enden versetzt, also läuft nie mehr als ein
 * Upload zugleich, und Metas Verarbeitung (Minuten je Video) reiht sich
 * hintereinander statt nebeneinander. Fertige Dateien warten deshalb auf ihre
 * Mitfahrer und gehen zusammen los.
 *
 * Der Encoder-Platz wird dabei nicht gehalten (siehe run): während ein Schwung
 * hochlädt, wandelt der nächste schon um. Beides läuft übereinander, nicht
 * nacheinander.
 */
const UPLOAD_GROUP = CONVERT_LANES;

const encoder = createGate(CONVERT_LANES);

export type UploadPhase =
  | "queued"
  | "preparing"
  | "converting"
  | "bundling"
  | "uploading"
  | "processing";

/**
 * Ein Upload durchläuft mehrere Abschnitte, und jeder davon kann Minuten dauern.
 * Vorher stand für alle zusammen ein einziges "Uploading…" da – von "hängt" war
 * das nicht zu unterscheiden.
 */
export type UploadJob = {
  id: string;
  /** Wohin die fertige Datei gehört. */
  adSetId: string;
  /** Mit welchem Griff sie ausgewählt wurde – der Toast zählt je Schwung. */
  batchId: string;
  name: string;
  /**
   * "queued" heißt: diese Datei muss umgewandelt werden und wartet auf einen
   * Encoder-Platz. "bundling" heißt: sie ist fertig und wartet nur noch auf die
   * anderen ihres Schwungs.
   */
  phase: UploadPhase;
  /** 0–1, nur wo es etwas zu messen gibt. */
  progress?: number;
  error?: string;
  note?: string;
  /**
   * Die Originaldatei und wohin sie gehört – allein für den zweiten Versuch.
   * Ein Fehlschlag ist hier fast immer die Leitung oder ein Wackler bei Meta,
   * und die Datei nochmal im Dateidialog zu suchen ist bei vierzig ausgewählten
   * Videos die eigentliche Strafe. Nichts davon wird gespeichert: ein Reload
   * nimmt beides mit, und dann ist die Auswahl ohnehin neu zu treffen.
   */
  file: File;
  target: Target;
};

type Target = { adSetId: string; adSetName: string; adAccount: string };

/** Ein Schwung ist, was in einem Griff ausgewählt wurde – ein Toast je Schwung. */
type Batch = {
  id: string;
  adSetId: string;
  adSetName: string;
  adAccount: string;
  total: number;
  done: number;
  failed: string[];
  /** Schließt den laufenden Toast – null, solange keiner offen ist. */
  dismiss: (() => void) | null;
  /** Der Sammelpunkt zwischen Umwandlung und Upload. */
  convoy: Convoy;
};

let jobs: UploadJob[] = [];
const batches = new Map<string, Batch>();

// ---------------------------------------------------------------- Abonnenten

let version = 0;
const listeners = new Set<() => void>();
/**
 * Je Anzeigengruppe eine Liste, die zwischen zwei Änderungen dieselbe bleibt.
 * useSyncExternalStore vergleicht mit ===; ein bei jedem Aufruf frisch
 * gefiltertes Array wäre eine Endlosschleife.
 */
let snapshots = new Map<string, UploadJob[]>();

/**
 * `adSetId` grenzt ein, welche Liste neu zu bauen ist. Ohne das bekäme bei jedem
 * Fortschrittsschritt – und die kommen im Sekundentakt je Datei – jede
 * Anzeigengruppe eine frische Liste und damit ein neues Rendern, obwohl sich an
 * ihren Uploads nichts geändert hat. Die unveränderten Jobs sind dieselben
 * Objekte, ihre zwischengespeicherte Liste bleibt also richtig.
 */
function changed(adSetId?: string) {
  version++;
  if (adSetId === undefined) snapshots = new Map();
  else snapshots.delete(adSetId);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const getVersion = () => version;

const EMPTY: UploadJob[] = [];

function jobsFor(adSetId: string): UploadJob[] {
  let list = snapshots.get(adSetId);
  if (!list) {
    list = jobs.filter((job) => job.adSetId === adSetId);
    snapshots.set(adSetId, list);
  }
  return list;
}

/**
 * Astryx' useToast ist ein Hook und lässt sich nur innerhalb einer Komponente
 * aufrufen – start() und settle() aber laufen außerhalb jeder Komponente, im
 * Modul-Zustand oben. useUploads() rendert bei jeder Anzeigengruppe, die
 * gerade zu sehen ist, und genau eine solche Anzeigengruppe ist es auch, aus
 * der heraus enqueue()/retryUploads() je angestoßen werden – "Datei wählen"
 * und "Erneut versuchen" sitzen beide in ihr. Die Funktion ist also schon
 * abgegriffen, bevor sie das erste Mal gebraucht wird, und bleibt gültig,
 * auch wenn genau diese Anzeigengruppe später wieder aushängt: sie hängt am
 * echten, dauerhaft im Layout stehenden Toast-Kontext, nicht an dieser
 * Komponente.
 */
let showToast: ShowToastFn | null = null;

/** Was für diese Anzeigengruppe gerade läuft – oder beim letzten Mal scheiterte. */
export function useUploads(adSetId: string): UploadJob[] {
  const toast = useToast();
  useEffect(() => {
    showToast = toast;
  }, [toast]);
  return useSyncExternalStore(
    subscribe,
    () => jobsFor(adSetId),
    // Beim Serverrendern läuft nichts, und laufen kann dort auch nichts.
    () => EMPTY,
  );
}

/** Zählt bei jeder Änderung hoch – für Effekte, die den Eingang leeren wollen. */
export function useUploadVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, () => 0);
}

// -------------------------------------------------------------------- Eingang

/**
 * Fertige Dateien warten hier, bis der Assistent sie abholt. Sie einfach in den
 * Entwurf zu schreiben, geht nicht: der Entwurf ist React-State, und der
 * existiert nur, solange jemand auf der Seite ist.
 */
const arrived = new Map<string, WizardLooseAsset[]>();

// Ein harter Reload beendet zwar jeden laufenden Upload, aber nicht die schon
// fertigen: die Datei liegt dann bei Meta und wäre ohne diesen Umweg nur noch
// dort. Derselbe Speicher wie der Entwurf, damit beides zusammen verfällt.
const ARRIVED_KEY = "medarbeiter:new-campaign:arrived";

function saveArrived() {
  try {
    sessionStorage.setItem(ARRIVED_KEY, JSON.stringify([...arrived]));
  } catch {
    // Voller oder gesperrter sessionStorage ist kein Grund, den Upload abzubrechen.
  }
}

if (typeof window !== "undefined") {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ARRIVED_KEY) ?? "[]") as [
      string,
      WizardLooseAsset[],
    ][];
    for (const [adSetId, assets] of stored) arrived.set(adSetId, assets);
  } catch {
    // Ein kaputter Eintrag darf die Seite nicht abschießen.
  }
}

function deposit(adSetId: string, asset: WizardLooseAsset) {
  arrived.set(adSetId, [...(arrived.get(adSetId) ?? []), asset]);
  saveArrived();
}

/**
 * Nimmt alles heraus, was seit dem letzten Mal angekommen ist. Der Aufrufer
 * trägt es in den Entwurf ein – und muss das tun, denn hier ist es danach weg.
 * Deshalb außerhalb eines setState-Updaters aufrufen: React ruft die im
 * Strict Mode zweimal auf, und der zweite Lauf fände einen leeren Eingang.
 */
export function drainArrived(): Map<string, WizardLooseAsset[]> {
  if (!arrived.size) return arrived;
  const all = new Map(arrived);
  arrived.clear();
  saveArrived();
  return all;
}

// --------------------------------------------------------------------- Arbeit

/**
 * Alles, was ausgewählt wurde, geht gleichzeitig los – ein ganzer Ordner als ein
 * Schwung. Der Auswahlknopf bleibt dabei offen: nachgelegte Dateien starten
 * sofort mit, statt auf den laufenden Schwung zu warten.
 */
export function enqueue(files: File[], target: Target): void {
  // Eine neue Auswahl räumt die Fehler des letzten Durchgangs weg; ein zweiter
  // Versuch (retryUploads) darf das nicht, sonst nähme er den übrigen
  // Fehlschlägen ihren eigenen Knopf.
  start(files, target, true);
}

/**
 * Nochmal, mit denselben Dateien. Betrifft nur die gescheiterten dieser
 * Anzeigengruppe – laufende bleiben unberührt, sie sind ja nicht gemeint.
 */
export function retryUploads(adSetId: string): void {
  const failed = jobs.filter((job) => job.adSetId === adSetId && job.error);
  if (!failed.length) return;

  const ids = new Set(failed.map((job) => job.id));
  jobs = jobs.filter((job) => !ids.has(job.id));
  // Der Schwung ist der, mit dem sie ausgewählt wurden – der Toast zählt sie
  // dadurch als eigenen Durchgang und nicht als Nachzügler eines vergangenen.
  start(
    failed.map((job) => job.file),
    failed[0].target,
    false,
  );
}

function start(files: File[], target: Target, clearFailed: boolean): void {
  if (!files.length) return;

  const batch: Batch = {
    id: crypto.randomUUID(),
    ...target,
    total: files.length,
    done: 0,
    failed: [],
    dismiss: null,
    convoy: createConvoy(UPLOAD_GROUP, files.length),
  };
  batches.set(batch.id, batch);

  const started = files.map((file) => ({
    file,
    job: {
      id: crypto.randomUUID(),
      adSetId: target.adSetId,
      batchId: batch.id,
      name: file.name,
      phase: "queued" as const,
      file,
      target,
    },
  }));

  // Fehler des letzten Durchgangs verschwinden, sobald es neu losgeht – laufende
  // Karten bleiben, die gehören ja noch zur Arbeit.
  jobs = [
    ...jobs.filter((job) => !(clearFailed && job.adSetId === target.adSetId && job.error)),
    ...started.map(({ job }) => job),
  ];
  changed(target.adSetId);

  // Kein automatisches Ausblenden: der Toast ist der Fortschritt, nicht die
  // Meldung darüber. body trägt Überschrift und Zähler zusammen, denn Astryx
  // kennt keine separate description mehr.
  batch.dismiss =
    showToast?.({
      body: (
        <>
          <BatchToast batchId={batch.id} />
          <div>{`„${target.adSetName}“ · Upload läuft.`}</div>
        </>
      ),
      isAutoHide: false,
    }) ?? null;

  for (const { file, job } of started) void run(job.id, file, batch);
}

async function run(id: string, file: File, batch: Batch) {
  const patch = (u: Partial<UploadJob>) => {
    jobs = jobs.map((job) => (job.id === id ? { ...job, ...u } : job));
    changed(batch.adSetId);
  };

  let joined = false;
  try {
    patch({ phase: "preparing" });
    // Die Maße kommen aus dem Original, nicht aus der umgewandelten Datei.
    const orientation = await orientationOfFile(file);

    let payload = file;
    if (file.type.startsWith("video/")) {
      // Umgewandelt wird im Browser, nicht auf dem Server: der hat die
      // Hardware-Encoder, und der Fortschritt ist so ohne Umweg ablesbar.
      //
      // Der Encoder-Platz wird erst geholt, wenn feststeht, dass diese Datei ihn
      // braucht (beforeWork in toMetaReady) – und wieder abgegeben, sobald die
      // Umwandlung durch ist, nicht erst nach dem Upload. Sonst hinge der
      // nächste Wartende an einer fremden Leitung statt am Encoder.
      let held = false;
      try {
        const ready = await toMetaReady(
          file,
          (progress) => patch({ phase: "converting", progress }),
          async () => {
            await encoder.acquire(() => patch({ phase: "queued", progress: undefined }));
            held = true;
          },
        );
        if (ready.note) patch({ note: ready.note });
        payload = ready.file;
      } finally {
        if (held) encoder.release();
      }
    }

    // Fertig – ab hier wartet die Datei auf ihre Mitfahrer, nicht mehr auf sich
    // selbst. Der Encoder-Platz ist da längst zurückgegeben: während dieser
    // Schwung hochlädt, wandelt der nächste schon um.
    joined = true;
    await batch.convoy.join(() => patch({ phase: "bundling", progress: undefined }));

    patch({ phase: "uploading", progress: 0 });
    const body = new FormData();
    body.set("file", payload);
    body.set("adAccount", batch.adAccount);
    const json = await postFile(body, (progress) =>
      // Ist der Body durch, hängt es nur noch an Metas Verarbeitung.
      patch(progress < 1 ? { progress } : { phase: "processing", progress: undefined }),
    );
    if (json.error) throw new Error(json.error);

    deposit(
      batch.adSetId,
      json.kind === "video"
        ? {
            id: crypto.randomUUID(),
            kind: "video",
            videoId: json.id,
            thumbnailUrl: json.thumbnail,
            fileName: file.name,
            orientation,
          }
        : {
            id: crypto.randomUUID(),
            kind: "image",
            hash: json.hash,
            fileName: file.name,
            orientation,
          },
    );

    batch.done++;
    // Die fertige Karte weicht der Anzeige; gescheiterte bleiben stehen.
    jobs = jobs.filter((job) => job.id !== id);
    changed(batch.adSetId);
  } catch (e) {
    batch.failed.push(file.name);
    patch({ error: (e as Error).message });
    // Wer es nicht bis zum Sammelpunkt schafft, meldet sich ab: sonst warten die
    // schon Fertigen auf einen Mitfahrer, der nie kommt.
    if (!joined) batch.convoy.drop();
  } finally {
    settle(batch);
  }
}

/** Der Schwung ist durch – der laufende Toast weicht dem Ergebnis. */
function settle(batch: Batch) {
  if (batch.done + batch.failed.length < batch.total) return;
  batches.delete(batch.id);
  batch.dismiss?.();

  // Astryx' Toast kennt nur "info" und "error" – kein eigenes "warning" oder
  // "success" (siehe Bericht). Nur der reine Erfolg bekommt "info" mit
  // automatischem Ausblenden; Teilerfolg bekommt ebenfalls "error", denn hier
  // fehlt etwas und ein zweiter Versuch ist nötig – bei gleicher Textlänge
  // wie beim Erfolg wäre das sonst nicht mehr auf den ersten Blick zu
  // unterscheiden. "error" bringt außerdem automatisch kein Ausblenden mit,
  // der Toast bleibt also stehen, bis die Datei erneut versucht wurde.
  const at = `„${batch.adSetName}“`;
  if (!batch.failed.length)
    showToast?.({
      body: (
        <>
          <div>{`${count(batch.total)} hochgeladen`}</div>
          <div>{`Bereit in ${at}.`}</div>
        </>
      ),
    });
  else if (batch.done)
    showToast?.({
      type: "error",
      body: (
        <>
          <div>{`${batch.done} von ${count(batch.total)} hochgeladen`}</div>
          <div>{`Nicht angekommen: ${batch.failed.join(", ")}`}</div>
        </>
      ),
    });
  else
    showToast?.({
      type: "error",
      body: (
        <>
          <div>{`${count(batch.total)} nicht hochgeladen`}</div>
          <div>{`${at} · ${batch.failed.join(", ")}`}</div>
        </>
      ),
    });

  // Ohne Anzeigengruppe: hier ändern sich keine Jobs, nur der Toast.
  changed();
}

const count = (n: number) => `${n} ${n === 1 ? "Datei" : "Dateien"}`;

/**
 * Der Toast schreibt sich selbst fort, statt für jede fertige Datei geschlossen
 * und neu geöffnet zu werden – sonst spränge er bei zehn Dateien zehnmal neu
 * herein. Er hängt am selben Store wie die Karten im Assistenten.
 */
function BatchToast({ batchId }: { batchId: string }) {
  useSyncExternalStore(subscribe, getVersion, () => 0);
  const batch = batches.get(batchId);
  if (!batch) return null;

  const mine = jobs.filter((job) => job.batchId === batchId && !job.error);
  const converting = mine.filter(
    (job) => job.phase === "converting" || job.phase === "queued",
  ).length;
  // Wer wartet, wartet auf andere – nicht auf die Leitung. Das steht dort, damit
  // ein stehender Fortschritt nicht nach Hänger aussieht.
  const bundling = mine.filter((job) => job.phase === "bundling").length;
  const label = `${batch.done} von ${count(batch.total)} hochgeladen`;
  return (
    <div className="flex items-center gap-2">
      {/* batch.total ist nie 0 (start() bricht bei leerer Auswahl vorher ab),
          der Anteil bleibt also immer eine gültige Zahl zwischen 0 und 1. */}
      <ProgressRing value={batch.done / batch.total} label={label} />
      <span>
        {label}
        {converting > 0 && ` · ${converting} in Umwandlung`}
        {bundling > 0 && ` · ${bundling} im Schwung bereit`}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ Werkzeuge

/**
 * fetch() kennt keinen Upload-Fortschritt, XHR schon – und bei 500-MB-Videos
 * ist genau der die Antwort auf "was passiert gerade?". Sobald der Body durch
 * ist, wartet nur noch Meta.
 */
function postFile(body: FormData, onProgress: (p: number) => void) {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error(`upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.send(body);
  });
}

/**
 * Die Ausrichtung entscheidet, ob ein Bild die Hoch- oder die Quadrat-Hälfte
 * ist – gelesen wird sie vor dem Upload, aus der Datei selbst. Bei Videos
 * kostet das nichts und entscheidet nichts (Videos sind immer UGC), wird aber
 * gebraucht, sobald jemand zwei von Hand zusammenzieht. Kann der Browser das
 * Video nicht öffnen (HEVC, ProRes), bleibt es bei "square": die harmlosere
 * Annahme, weil sie zum Paaren zwingt statt still durchzurutschen.
 */
async function orientationOfFile(file: File): Promise<Orientation> {
  try {
    if (file.type.startsWith("image/")) {
      const bitmap = await createImageBitmap(file);
      const orientation = orientationOf(bitmap.width, bitmap.height);
      bitmap.close();
      return orientation;
    }
    return await new Promise<Orientation>((resolve) => {
      const url = URL.createObjectURL(file);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(orientationOf(probe.videoWidth, probe.videoHeight));
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("square");
      };
      probe.src = url;
    });
  } catch {
    return "square";
  }
}
