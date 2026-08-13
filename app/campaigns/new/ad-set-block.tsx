"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDialog,
  Button,
  Description,
  Dropdown,
  Fieldset,
  Input,
  Label,
  ListBox,
  NumberField,
  ProgressCircle,
  Select,
  Separator,
  Spinner,
  TextArea,
  TextField,
  Toolbar,
} from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import type { LeadForm } from "@/lib/forms";
import { instantFormsUrl } from "@/lib/forms";
import { toMetaReady } from "@/lib/transcode";
import {
  nextCreativeName,
  normalizeAdName,
  orientationOf,
  planAds,
  uniqueName,
  type Orientation,
} from "@/lib/media";
import { checkCopy, type CopyField, type Notice } from "@/lib/copy";
import {
  detachAd,
  needsSecondText,
  type WizardAd,
  type WizardAdSet,
  type WizardAsset,
  type WizardLooseAsset,
  type WizardVideoAsset,
} from "./state";
import { listFormsAction } from "../actions";

const BODY_LIMIT = 4399;
const TITLE_LIMIT = 255;
const DESCRIPTION_LIMIT = 1500;
const MAX_ITEMS = 5;

/** Was der Browser an Dateien annimmt – der Route Handler lehnt alles andere ab. */
const ACCEPT = "video/*,image/jpeg,image/png";

/**
 * Ein Upload durchläuft vier Abschnitte, und jeder davon kann Minuten dauern.
 * Vorher stand für alle zusammen ein einziges "Uploading…" da – von "hängt" war
 * das nicht zu unterscheiden.
 */
type Upload = {
  id: string;
  name: string;
  phase: "preparing" | "converting" | "uploading" | "processing";
  /** 0–1, nur wo es etwas zu messen gibt. */
  progress?: number;
  error?: string;
  note?: string;
};

const percent = (p?: number) => (p === undefined ? "" : ` · ${Math.round(p * 100)}%`);

const phaseLabel = (u: Upload) =>
  u.error
    ? "Fehlgeschlagen"
    : {
        preparing: "Format wird geprüft…",
        converting: `Konvertierung zu MP4${percent(u.progress)}`,
        uploading: `Wird hochgeladen${percent(u.progress)}`,
        processing: "Meta verarbeitet…",
      }[u.phase];

/**
 * Solange der Abschnitt messbar ist (Konvertierung, Upload), zeigt der Ring den
 * Stand; Metas Verarbeitung meldet nichts, dort dreht sich nur der Spinner.
 */
const UploadIndicator = ({ upload }: { upload: Upload }) =>
  upload.progress === undefined ? (
    <Spinner />
  ) : (
    <ProgressCircle
      aria-label={phaseLabel(upload)}
      size="sm"
      value={upload.progress}
      minValue={0}
      maxValue={1}
    >
      <ProgressCircle.Track>
        <ProgressCircle.TrackCircle />
        <ProgressCircle.FillCircle />
      </ProgressCircle.Track>
    </ProgressCircle>
  );

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

/**
 * Ein Paar darf gegen die Regel gebildet werden – aber nicht unbemerkt. Der
 * Hinweis steht an der Karte und hält niemanden auf.
 */
function pairWarning(portrait: WizardAsset, square: WizardAsset): string | undefined {
  if (portrait.orientation === square.orientation)
    return "Beide Hälften haben das gleiche Format — eine sollte 9:16 sein, die andere 1:1.";
  if (portrait.kind !== square.kind) return "Dieses Paar mischt ein Video und ein Bild.";
  if (portrait.kind === "video") return "Zwei Videos von Hand gepaart — Videos laufen normalerweise als UGC-Anzeigen.";
  return undefined;
}

const withId = (a: WizardAsset): WizardLooseAsset => ({ ...a, id: crypto.randomUUID() });

/**
 * Hinweise zum Text, direkt am jeweiligen Feld. Nichts davon hält jemanden auf –
 * die Regeln sind an den laufenden Kampagnen gemessen (siehe lib/copy.ts), aber
 * eine Stellenanzeige darf jederzeit anders aussehen als die letzten hundert.
 */
function CopyNotices({ notices, field }: { notices: Notice[]; field: CopyField }) {
  const mine = notices.filter((n) => n.field === field);
  if (!mine.length) return null;
  return (
    <ul className="space-y-1">
      {mine.map((n) => (
        <li
          key={n.message}
          className={`text-xs ${n.level === "warn" ? "text-danger" : "text-ink-500"}`}
        >
          <span aria-hidden>{n.level === "warn" ? "▲" : "ℹ"}</span>{" "}
          <span className="sr-only">{n.level === "warn" ? "Warnung:" : "Hinweis:"}</span>
          {n.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ein Feld pro Eintrag plus Zähler, Hinzufügen/Entfernen – für bodies und
 * titles identisch bis auf Zeilenzahl und Zeichenlimit, deshalb ein Helfer
 * statt zweimal derselbe Block.
 */
function TextListField({
  label: labelText,
  values,
  limit,
  multiline,
  onChange,
}: {
  label: string;
  values: string[];
  limit: number;
  multiline?: boolean;
  onChange: (values: string[]) => void;
}) {
  const update = (i: number, v: string) =>
    onChange(values.map((val, idx) => (idx === i ? v : val)));
  const add = () => onChange([...values, ""]);
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <Label>
        {labelText} ({values.length}/{MAX_ITEMS})
      </Label>
      {values.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <TextField value={v} onChange={(nv) => update(i, nv)} className="flex-1 space-y-1">
            {multiline ? <TextArea rows={3} maxLength={limit} /> : <Input maxLength={limit} />}
            {/* Der Zähler gehört ans Feld, nicht daneben: Description hängt per
                aria-describedby daran und wird mit vorgelesen. */}
            <Description className={v.length > limit ? "text-danger" : undefined}>
              {v.length}/{limit}
            </Description>
          </TextField>
          <div className="flex flex-col items-end gap-1 pt-1">
            <Button
              variant="outline"
              size="sm"
              onPress={() => remove(i)}
              isDisabled={values.length === 1}
            >
              Entfernen
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onPress={add} isDisabled={values.length >= MAX_ITEMS}>
        Hinzufügen
      </Button>
    </div>
  );
}

/**
 * Ein Bild hat nur einen Hash, keine anzeigbare URL – dafür steht hier der
 * Dateiname statt eines kaputten Bildes.
 */
function AssetTile({ asset, caption }: { asset: WizardAsset; caption?: string }) {
  const url = asset.kind === "video" ? asset.thumbnailUrl : undefined;
  return (
    <div className="w-28 space-y-1">
      {caption && <p className="text-ink-500 text-[11px] leading-tight">{caption}</p>}
      {url ? (
        // Meta-CDN-Host steht nicht in next.config.ts als images.remotePatterns –
        // next/image würde zur Laufzeit fehlschlagen, daher bewusst ein <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="border-line h-16 w-full rounded border object-cover" />
      ) : (
        <div className="bg-surface border-line grid h-16 w-full place-items-center rounded border px-1">
          <span className="text-ink-500 w-full truncate text-center text-[10px]">
            {asset.fileName}
          </span>
        </div>
      )}
    </div>
  );
}

const DRAG_TYPE = "application/x-medarbeiter-asset";

/** Eine Anzeige: ein Video (UGC) oder ein Paar (Split). */
function AdCard({
  ad,
  borrowers,
  onDropAsset,
  onRename,
  onUnpair,
  onRemove,
}: {
  ad: WizardAd;
  borrowers: string[];
  onDropAsset: (looseId: string) => void;
  onRename: (name: string) => void;
  onUnpair: () => void;
  onRemove: () => void;
}) {
  const [over, setOver] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const linked = Boolean(ad.source);

  return (
    <li
      className={`border-line w-full max-w-md space-y-2 rounded-xl border p-2 ${
        over ? "border-gold-500" : ""
      }`}
      onDragOver={(e) => {
        // Nur eine UGC-Anzeige kann noch eine Hälfte aufnehmen.
        if (ad.type !== "ugc") return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (ad.type !== "ugc") return;
        e.preventDefault();
        const looseId = e.dataTransfer.getData(DRAG_TYPE);
        if (looseId) onDropAsset(looseId);
      }}
    >
      <div className="flex items-start gap-3">
        {ad.type === "ugc" ? (
          <AssetTile asset={ad.asset} caption="UGC · jede Platzierung" />
        ) : (
          <>
            <AssetTile asset={ad.portrait} caption="Hochformat · Story, Reels" />
            <AssetTile asset={ad.square} caption="Quadratisch · Feed" />
          </>
        )}

        <div className="flex-1 space-y-1">
          <TextField value={ad.name} onChange={onRename} className="space-y-1">
            <Label className="sr-only">Anzeigenname</Label>
            <Input aria-label="Anzeigenname" />
          </TextField>
          {linked && (
            <p className="text-ink-500 text-[11px]">
              Verlinkt — Bearbeiten löst die Verbindung
            </p>
          )}
          {ad.type === "split" && ad.reason && !linked && (
            <p className="text-ink-500 text-[11px]">Gepaart durch {ad.reason}</p>
          )}
        </div>
      </div>

      {ad.warn && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>{ad.warn}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="flex gap-2">
        {ad.type === "split" && (
          <Button variant="outline" size="sm" onPress={onUnpair}>
            Trennen
          </Button>
        )}
        {/* Fremden Inhalt nie als Nebenwirkung löschen: wer diese Anzeige leiht,
            steht in der Rückfrage. */}
        <Button
          variant="outline"
          size="sm"
          onPress={() => (borrowers.length ? setConfirming(true) : onRemove())}
        >
          Entfernen
        </Button>
      </div>

      <AlertDialog isOpen={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon />
                <AlertDialog.Heading>Anzeige wird woanders verwendet</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                &bdquo;{ad.name}&ldquo; ist auch in {borrowers.join(", ")} im Einsatz. Dort
                verschwindet der Inhalt mit.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" onPress={() => setConfirming(false)}>
                  Abbrechen
                </Button>
                <Button
                  onPress={() => {
                    setConfirming(false);
                    onRemove();
                  }}
                >
                  Trotzdem entfernen
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </li>
  );
}

export function AdSetBlock({
  value,
  pageId,
  pageName,
  instagramUserId,
  adAccount,
  business,
  blockers,
  otherAdSets,
  borrowersOfAd,
  onChange,
  onRemove,
  canRemove,
}: {
  value: WizardAdSet;
  pageId: string;
  pageName: string;
  instagramUserId?: string;
  adAccount: string;
  /** Der beworbene Kunde – für die Namensregel in lib/copy.ts. */
  business: string;
  /** Was hier noch fehlt (adSetBlockers) – dieselbe Liste, die die Kopfzeile zählt. */
  blockers: string[];
  /** Andere Anzeigengruppen dieser Kampagne, aus denen geliehen werden kann. */
  otherAdSets: { id: string; name: string; ads: WizardAd[] }[];
  borrowersOfAd: (adId: string) => string[];
  onChange: (patch: Partial<WizardAdSet>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [formsError, setFormsError] = useState<string>();
  const [formsLoading, setFormsLoading] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const busy = uploads.some((u) => !u.error);

  const refreshForms = async () => {
    setFormsLoading(true);
    const res = await listFormsAction(pageId);
    setForms(res.forms);
    setFormsError(res.error);
    setFormsLoading(false);
  };

  // Beim Öffnen des Blocks direkt laden, nicht erst nach Klick auf Refresh –
  // gerade der Fehlende-Rechte-Fehler soll sofort sichtbar sein.
  useEffect(() => {
    if (pageId) refreshForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Ein Formular gehört genau einer Seite. Wechselt der beworbene Kunde, zeigt
  // die getroffene Auswahl auf ein Formular einer fremden Seite – Meta nimmt
  // die Anzeige dann gar nicht erst an, und zwar erst beim Anlegen. Deshalb
  // beim Seitenwechsel zurücksetzen. Der erste Lauf zählt nicht: dort steht
  // die Seite zum ersten Mal fest, und ein wiederhergestellter Entwurf soll
  // sein Formular behalten.
  const knownPage = useRef(pageId);
  useEffect(() => {
    if (knownPage.current === pageId) return;
    knownPage.current = pageId;
    if (value.formId) onChange({ formId: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Laut Spec nur Bestätigung, keine Auswahl – aber buildCreative() braucht den
  // Wert im State, sonst kommt er nie in der Kampagne an.
  useEffect(() => {
    if (instagramUserId && value.instagramUserId !== instagramUserId) {
      onChange({ instagramUserId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramUserId]);

  /**
   * Neu angekommene Dateien mit dem, was noch ungepaart herumliegt, zu Anzeigen
   * planen: Videos werden UGC, Bilder suchen sich über benachbarte Namen ihre
   * Hälfte. Was übrig bleibt, bleibt sichtbar liegen statt geraten zu werden.
   */
  const addAssets = (arrived: WizardLooseAsset[]) => {
    const { ads: planned, unpaired } = planAds([...value.loose, ...arrived]);
    const taken = new Set(value.ads.map((a) => a.name));

    const fresh = planned.map((p): WizardAd => {
      if (p.type === "ugc") {
        // Ohne Endung und ohne Kampagnennamen: so steht es später in Meta.
        const name = uniqueName(normalizeAdName(p.asset.fileName), taken);
        taken.add(name);
        return {
          id: crypto.randomUUID(),
          name,
          type: "ugc",
          // planAds() steckt ausschließlich Videos in "ugc".
          asset: p.asset as WizardVideoAsset,
        };
      }
      const name = nextCreativeName(taken);
      taken.add(name);
      return {
        id: crypto.randomUUID(),
        name,
        type: "split",
        portrait: p.portrait,
        square: p.square,
        reason: p.reason,
      };
    });

    onChange({ ads: [...value.ads, ...fresh], loose: unpaired });
  };

  // Parallel per XHR gegen den Route Handler, bewusst keine Server Action:
  // Next schickt Actions pro Client streng nacheinander, das würde ein Batch
  // UGC-Videos serialisieren, während jedes für sich minutenlang enkodiert.
  async function onFiles(files: FileList) {
    const batch = [...files].map((file) => ({ file, id: crypto.randomUUID() }));
    // Fehler des letzten Durchgangs verschwinden, sobald es neu losgeht.
    setUploads(batch.map(({ file, id }) => ({ id, name: file.name, phase: "preparing" })));

    const patch = (id: string, u: Partial<Upload>) =>
      setUploads((all) => all.map((x) => (x.id === id ? { ...x, ...u } : x)));

    const done = await Promise.allSettled(
      batch.map(async ({ file, id }): Promise<WizardLooseAsset> => {
        try {
          // Die Maße kommen aus dem Original, nicht aus der umgewandelten Datei.
          const orientation = await orientationOfFile(file);

          let payload = file;
          if (file.type.startsWith("video/")) {
            // Umgewandelt wird hier, nicht auf dem Server: der Browser hat die
            // Hardware-Encoder, und der Fortschritt ist so ohne Umweg ablesbar.
            const ready = await toMetaReady(file, (progress) =>
              patch(id, { phase: "converting", progress }),
            );
            if (ready.note) patch(id, { note: ready.note });
            payload = ready.file;
          }

          patch(id, { phase: "uploading", progress: 0 });
          const fd = new FormData();
          fd.set("file", payload);
          fd.set("adAccount", adAccount);
          const json = await postFile(fd, (progress) =>
            // Ist der Body durch, hängt es nur noch an Metas Verarbeitung.
            patch(id, progress < 1 ? { progress } : { phase: "processing", progress: undefined }),
          );

          if (json.error) throw new Error(json.error);
          return json.kind === "video"
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
              };
        } catch (e) {
          patch(id, { error: (e as Error).message });
          throw new Error(`${file.name}: ${(e as Error).message}`);
        }
      }),
    );

    const arrived = done.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (arrived.length) addAssets(arrived);
    // Gelungene Karten weichen den Anzeigen, gescheiterte bleiben stehen.
    setUploads((all) => all.filter((u) => u.error));
  }

  /** Zwei liegengebliebene Hälften von Hand zusammenziehen. */
  const pairLoose = (aId: string, bId: string) => {
    const a = value.loose.find((x) => x.id === aId);
    const b = value.loose.find((x) => x.id === bId);
    if (!a || !b || a.id === b.id) return;
    const [portrait, square] = a.orientation === "portrait" ? [a, b] : [b, a];
    const taken = new Set(value.ads.map((x) => x.name));
    onChange({
      ads: [
        ...value.ads,
        {
          id: crypto.randomUUID(),
          name: nextCreativeName(taken),
          type: "split",
          portrait,
          square,
          warn: pairWarning(portrait, square),
        },
      ],
      loose: value.loose.filter((x) => x.id !== a.id && x.id !== b.id),
    });
  };

  /** Eine liegengebliebene Hälfte auf eine UGC-Anzeige ziehen macht ein Paar daraus. */
  const pairWithAd = (adId: string, looseId: string) => {
    const ad = value.ads.find((a) => a.id === adId);
    const asset = value.loose.find((x) => x.id === looseId);
    if (!ad || ad.type !== "ugc" || !asset) return;
    const [portrait, square] =
      ad.asset.orientation === "portrait" ? [ad.asset, asset] : [asset, ad.asset];
    const taken = new Set(value.ads.filter((a) => a.id !== adId).map((a) => a.name));
    onChange({
      ads: value.ads.map((a) =>
        a.id === adId
          ? detachAd({
              id: a.id,
              name: nextCreativeName(taken),
              source: a.source,
              type: "split",
              portrait,
              square,
              warn: pairWarning(portrait, square),
            })
          : a,
      ),
      loose: value.loose.filter((x) => x.id !== looseId),
    });
  };

  const unpair = (adId: string) => {
    const ad = value.ads.find((a) => a.id === adId);
    if (!ad || ad.type !== "split") return;
    onChange({
      ads: value.ads.filter((a) => a.id !== adId),
      loose: [...value.loose, withId(ad.portrait), withId(ad.square)],
    });
  };

  // Jede Änderung an einer geliehenen Anzeige löst die Verbindung – nur für
  // diese eine, die Quelle bleibt unberührt.
  const renameAd = (adId: string, name: string) =>
    onChange({
      ads: value.ads.map((a) => (a.id === adId ? detachAd({ ...a, name }) : a)),
    });

  const removeAd = (adId: string) =>
    onChange({ ads: value.ads.filter((a) => a.id !== adId) });

  const removeLoose = (looseId: string) =>
    onChange({ loose: value.loose.filter((x) => x.id !== looseId) });

  /** Inhalt aus einer anderen Anzeigengruppe leihen statt erneut hochzuladen. */
  const linkFrom = (sourceSetId: string) => {
    const src = otherAdSets.find((s) => s.id === sourceSetId);
    if (!src) return;
    const already = new Set(
      value.ads.filter((a) => a.source).map((a) => `${a.source!.adSetId}:${a.source!.adId}`),
    );
    const fresh = src.ads
      .filter((a) => !a.source && !already.has(`${src.id}:${a.id}`))
      .map((a): WizardAd => {
        const { id: _id, ...content } = a;
        return { ...content, id: crypto.randomUUID(), source: { adSetId: src.id, adId: a.id } };
      });
    if (fresh.length) onChange({ ads: [...value.ads, ...fresh] });
  };

  const linkable = otherAdSets.filter((s) => s.ads.some((a) => !a.source));
  const secondTextMissing = needsSecondText(value);
  const notices = checkCopy({
    bodies: value.bodies,
    titles: value.titles,
    description: value.description,
    business,
  });

  return (
    <div className="space-y-8">
      {/* Dieselben offenen Punkte, die die Kopfzeile als Zahl trägt – hier
          ausgeschrieben, damit man nicht raten muss, welche gemeint sind. */}
      {blockers.length > 0 && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>Hier fehlt noch etwas</Alert.Title>
            <Alert.Description>
              <ul className="list-disc space-y-1 pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Fieldset>
        <Fieldset.Legend>Standort und Umkreis</Fieldset.Legend>
        <Fieldset.Group>
          <TextField
            value={value.name}
            onChange={(name) => onChange({ name })}
            isRequired
            className="space-y-1"
          >
            <Label>Name der Anzeigengruppe</Label>
            <Input />
          </TextField>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              value={value.addressString}
              onChange={(addressString) => onChange({ addressString })}
              isRequired
              className="space-y-1"
            >
              <Label>Adresse</Label>
              <Input placeholder="Musterstraße 1, 12345 Musterstadt" />
            </TextField>

            <NumberField
              value={value.radiusKm}
              onChange={(radiusKm) => onChange({ radiusKm })}
              minValue={1}
              maxValue={80}
              step={1}
              // Die Einheit gehört ins Feld, nicht daneben: so bleibt sie beim
              // Tippen sichtbar und kann nicht mitgelöscht werden.
              formatOptions={{ style: "unit", unit: "kilometer", unitDisplay: "short" }}
              className="space-y-1"
            >
              <Label>Radius</Label>
              <NumberField.Group>
                <NumberField.Input />
              </NumberField.Group>
              <Description>Meta erlaubt 1 bis 80 km um die Adresse.</Description>
            </NumberField>
          </div>
        </Fieldset.Group>
      </Fieldset>

      <Separator />

      <Fieldset>
        {/* Wessen Formulare das sind, steht in der Überschrift – ohne den
            Seitennamen sah die Liste des falschen Kunden genauso aus wie die
            richtige. */}
        <Fieldset.Legend>
          Lead-Formular {pageName && <span className="text-ink-500">· {pageName}</span>}
        </Fieldset.Legend>
        <Fieldset.Group>
        <Select
          aria-label="Lead-Formular"
          selectedKey={value.formId || null}
          onSelectionChange={(key) => onChange({ formId: String(key) })}
          isDisabled={!pageId}
          placeholder={
            !pageId
              ? "Erst den beworbenen Kunden wählen…"
              : formsLoading
                ? "Wird geladen…"
                : "Formular auswählen…"
          }
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox items={forms}>
              {(f: LeadForm) => (
                <ListBox.Item id={f.id} textValue={f.name}>
                  {f.name}
                </ListBox.Item>
              )}
            </ListBox>
          </Select.Popover>
        </Select>
        {formsError && (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>Lead-Formulare konnten nicht geladen werden</Alert.Title>
              <Alert.Description>{formsError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {/* Kein Fehler, aber auch keine Auswahl: die Seite hat schlicht noch
            kein Formular. Ohne diesen Hinweis wirkt das leere Feld wie ein Bug. */}
        {!formsError && !formsLoading && pageId && forms.length === 0 && (
          <Description>
            {pageName || "Diese Seite"} hat noch kein Lead-Formular — erstelle eines in Meta und
            klicke dann auf Aktualisieren.
          </Description>
        )}
        </Fieldset.Group>

        <Fieldset.Actions>
          {/* Ohne asset_id landet der Baukasten auf der Seite, die im Business
              Manager zuletzt offen war – in der Praxis MedArbeiter statt des
              Kunden. Lieber gar nicht anbieten als auf die falsche Seite. */}
          <Button
            variant="outline"
            size="sm"
            isDisabled={!pageId}
            onPress={() => window.open(instantFormsUrl(pageId), "_blank")}
          >
            Formular in Meta erstellen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={refreshForms}
            isDisabled={formsLoading || !pageId}
          >
            {formsLoading ? "Wird aktualisiert…" : "Aktualisieren"}
          </Button>
        </Fieldset.Actions>
      </Fieldset>

      <Separator />

      <Fieldset>
        <Fieldset.Legend>Inhalt</Fieldset.Legend>
        {/* Rein informativ – die Auswahl passiert nicht hier, sondern folgt aus
            der Seite des Kunden (siehe wizard.tsx). Fehlt das Instagram-Konto,
            ist das kein Fehler: die Anzeige läuft dann nur über die Seite. */}
        <Description>
          {instagramUserId
            ? `Wird auf Instagram als @${instagramUserId} veröffentlicht`
            : "Nur Facebook-Seite — kein Instagram-Konto verbunden"}
        </Description>
        <Fieldset.Group>
        <input
          type="file"
          accept={ACCEPT}
          multiple
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
          className="block text-sm"
        />
        {/* Warum das Warten manchmal länger dauert, und warum Fotos immer zu
            zweit auftreten müssen. */}
        <Description className="block">
          Videos werden von allein zu UGC-Anzeigen. Fotos werden 9:16 + 1:1 gepaart — passende
          Nummern („Creative 3“, „Creative 4“) werden automatisch gepaart, alles andere ziehst du
          selbst zusammen. iPhone- und Schnittexporte (HEVC, ProRes) werden vor dem Upload zu
          H.264/MP4 konvertiert.
        </Description>

        {value.ads.length > 0 && (
          <ul className="space-y-2">
            {value.ads.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                borrowers={borrowersOfAd(ad.id)}
                onDropAsset={(looseId) => pairWithAd(ad.id, looseId)}
                onRename={(name) => renameAd(ad.id, name)}
                onUnpair={() => unpair(ad.id)}
                onRemove={() => removeAd(ad.id)}
              />
            ))}
          </ul>
        )}

        {value.loose.length > 0 && (
          <Alert status="danger" className="flex-col items-stretch">
            <Alert.Content>
              <Alert.Title>
                {value.loose.length} Datei(en) brauchen noch einen Partner
              </Alert.Title>
              <Alert.Description>
                Ziehe eine auf eine andere, um sie zu paaren, oder auf eine UGC-Anzeige, um ihr
                ein zweites Format zu geben.
              </Alert.Description>
            </Alert.Content>
            <ul className="flex flex-wrap gap-3">
              {value.loose.map((asset) => (
                <li
                  key={asset.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, asset.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragged = e.dataTransfer.getData(DRAG_TYPE);
                    if (dragged) pairLoose(dragged, asset.id);
                  }}
                  className="border-line cursor-grab space-y-1 rounded-xl border p-2"
                >
                  <AssetTile
                    asset={asset}
                    caption={asset.orientation === "portrait" ? "Hochformat 9:16" : "Quadratisch 1:1"}
                  />
                  <Button variant="outline" size="sm" onPress={() => removeLoose(asset.id)}>
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {uploads.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {/* Eine Karte je Datei, an derselben Stelle, an der gleich das
                Thumbnail steht – der Platz bleibt, nur der Inhalt wechselt. */}
            {uploads.map((u) => (
              <li
                key={u.id}
                className={`w-32 space-y-1 rounded-xl border p-2 ${
                  u.error ? "border-danger" : "border-line"
                }`}
                aria-live="polite"
              >
                <div className="bg-surface flex h-16 items-center justify-center rounded">
                  {u.error ? (
                    <span className="text-danger text-xl">!</span>
                  ) : (
                    <UploadIndicator upload={u} />
                  )}
                </div>
                <p className="truncate text-xs" title={u.name}>
                  {u.name}
                </p>
                <p
                  className={`text-[11px] leading-tight ${u.error ? "text-danger" : "text-ink-500"}`}
                  title={u.error ?? u.note}
                >
                  {phaseLabel(u)}
                </p>
                {u.note && !u.error && (
                  <p className="text-ink-500 text-[11px] leading-tight">unkonvertiert hochgeladen</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {uploads.some((u) => u.error) && (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>Einige Uploads sind fehlgeschlagen</Alert.Title>
              <Alert.Description>
                {uploads
                  .filter((u) => u.error)
                  .map((u) => `${u.name}: ${u.error}`)
                  .join(" · ")}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        </Fieldset.Group>

        {linkable.length > 0 && (
          <Fieldset.Actions>
            {/* Das ist eine Aktion, kein Wert: nach dem Klick ist der Inhalt
                übernommen und es gibt nichts, was das Feld weiter anzeigen
                könnte. Als <select> musste es sich nach jeder Wahl selbst
                zurücksetzen. */}
            <Dropdown>
              <Dropdown.Trigger className={buttonVariants({ variant: "outline", size: "sm" })}>
                Inhalt übernehmen von…
              </Dropdown.Trigger>
              <Dropdown.Popover>
                <Dropdown.Menu items={linkable} onAction={(key) => linkFrom(String(key))}>
                  {(s: { id: string; name: string }) => (
                    <Dropdown.Item id={s.id} textValue={s.name}>
                      {s.name}
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </Fieldset.Actions>
        )}
      </Fieldset>

      <Separator />

      <Fieldset>
        <Fieldset.Legend>Texte</Fieldset.Legend>
        <Fieldset.Group>
          <TextListField
            label="Primärtexte"
            values={value.bodies}
            limit={BODY_LIMIT}
            multiline
            onChange={(bodies) => onChange({ bodies })}
          />
          <CopyNotices notices={notices} field="bodies" />

          {/* Meta lehnt eine UGC-Anzeige ab, bei der jedes Textfeld nur einen
              Eintrag hat – lieber hier sagen als mitten im Anlegen. */}
          {secondTextMissing && (
            <Alert status="warning">
              <Alert.Content>
                <Alert.Title>Zweiten Primärtext oder zweite Überschrift hinzufügen</Alert.Title>
                <Alert.Description>
                  Meta lehnt eine UGC-Anzeige ab, die von jedem nur einen hat. Split-Anzeigen sind
                  davon nicht betroffen.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <TextListField
            label="Überschriften"
            values={value.titles}
            limit={TITLE_LIMIT}
            onChange={(titles) => onChange({ titles })}
          />
          <CopyNotices notices={notices} field="titles" />

          <TextField
            value={value.description}
            onChange={(description) => onChange({ description })}
            className="space-y-1"
          >
            <Label>
              Beschreibung ({value.description.length}/{DESCRIPTION_LIMIT})
            </Label>
            {/* Mehrzeilig wie die Primary texts: hier stehen Aufzählungen mit
                Zeilenumbrüchen ("✔ 30 Tage Urlaub …"), keine Schlagzeile. */}
            <TextArea rows={6} maxLength={DESCRIPTION_LIMIT} />
          </TextField>
          <CopyNotices notices={notices} field="description" />
        </Fieldset.Group>
      </Fieldset>

      <Separator />

      {/* Ganz unten und nur als Umriss: das Entfernen ist die seltenste Aktion
          hier und stand vorher als erstes in der Kopfzeile. */}
      <Toolbar aria-label="Anzeigengruppe">
        <Button variant="outline" onPress={onRemove} isDisabled={!canRemove}>
          Standort entfernen
        </Button>
      </Toolbar>
    </div>
  );
}
