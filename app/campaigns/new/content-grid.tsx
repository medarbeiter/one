"use client";

/**
 * Die Inhaltsfläche einer Anzeigengruppe.
 *
 * Vorher waren es drei verschiedene Kartenformen für denselben Gegenstand: eine
 * breite Zeile je Anzeige (max-w-md, untereinander), eine schmale Kachel je
 * liegengebliebener Datei und eine dritte, wieder anders breite, je laufendem
 * Upload. Bei fünfzehn Videos hieß das fünfzehn Zeilen Papierrolle – und beim
 * Fertigwerden sprang die Kachel an eine andere Stelle in einer anderen Größe.
 *
 * Jetzt gibt es genau eine Kachel. Sie hat für alle drei Zustände dieselbe
 * Geometrie: Kopfzeile mit Art und Menü, Bühne mit den Vorschaurahmen, Name,
 * eine Statuszeile. Was sich beim Hochladen ändert, ist der Inhalt der Rahmen,
 * nicht ihr Platz – die Kachel wandert nicht und wächst nicht, wenn Meta fertig
 * ist. Die Rahmen zeigen die Platzierung, in der Meta das Motiv ausspielt:
 * 9:16 für Video (UGC läuft in Story und Reels), 9:16 *und* 1:1 für Bilder,
 * weil ein Bild in beiden Formaten erscheint – als Paar mit zwei Motiven oder
 * als Einzelbild, das Meta selbst zurechtschneidet.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AlertDialog, DropdownMenu, Skeleton, TextInput } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { ProgressRing } from "@/app/shell/progress-ring";
import { cleanStem, imagePreviewUrl, type Orientation } from "@/lib/media";
import { CropDialog } from "./crop-dialog";
import type { UploadJob } from "./upload-queue";
import type { WizardAd, WizardAsset, WizardImageAsset, WizardLooseAsset } from "./state";

export const DRAG_TYPE = "application/x-medarbeiter-asset";

/** Welche Hälfte einer Anzeige ein Bild besetzt – für den Ersatz nach dem Zuschnitt. */
export type AssetSlot = "asset" | "portrait" | "square";

const RATIO = {
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
} as const;

type Ratio = keyof typeof RATIO;

/**
 * Video: das Thumbnail von Meta. Bild: über app/api/image, weil beim Upload nur
 * ein Hash zurückkommt. Ohne beides bleibt der Dateiname im leeren Rahmen – ein
 * kaputtes <img> sagt weniger als der Name.
 */
const previewUrl = (asset: WizardAsset, adAccount: string) =>
  asset.kind === "video"
    ? asset.thumbnailUrl
    : adAccount
      ? imagePreviewUrl(asset.hash, adAccount)
      : undefined;

/**
 * Ein Rahmen im Seitenverhältnis einer Platzierung. Die Höhe kommt von der
 * Bühne, die Breite aus dem Verhältnis – deshalb stehen 9:16 und 1:1
 * nebeneinander wie in Metas Vorschau und nicht wie zwei gleich große Klötze.
 */
function MediaFrame({
  ratio,
  url,
  alt,
  isDimmed,
  isPending,
  onCrop,
}: {
  ratio: Ratio;
  url?: string;
  alt: string;
  isDimmed?: boolean;
  /** Es kommt noch etwas: der leere Rahmen schimmert, statt leer zu bleiben. */
  isPending?: boolean;
  /** Der Rahmen selbst ist der Weg zum Zuschnitt: wer das Format sieht, klickt es an. */
  onCrop?: () => void;
}) {
  // Ein Hash, den Meta nicht mehr auflöst, ist kein seltener Sonderfall: die
  // Vorschau-Adressen laufen ab. Das kaputte Bildsymbol samt überlaufendem
  // Dateinamen sagt weniger als der Name allein im leeren Rahmen.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);

  const Tag = onCrop ? "button" : "div";
  return (
    <Tag
      type={onCrop ? "button" : undefined}
      title={onCrop ? `${alt} – ${ratio} zuschneiden` : alt}
      aria-label={onCrop ? `${alt} auf ${ratio} zuschneiden` : undefined}
      onClick={onCrop}
      className={`border-line bg-surface group relative h-full shrink-0 overflow-hidden rounded-md border ${RATIO[ratio]} ${
        onCrop ? "focus-visible:ring-gold-500 cursor-pointer outline-none focus-visible:ring-2" : ""
      }`}
    >
      {url && !broken ? (
        // Meta-CDN-Host steht nicht in next.config.ts als images.remotePatterns –
        // next/image würde zur Laufzeit fehlschlagen, daher bewusst ein <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          onError={() => setBroken(true)}
          className={`size-full object-cover ${isDimmed ? "opacity-30" : ""}`}
        />
      ) : isPending ? (
        // Ein Video hat vor Metas Thumbnail kein Bild. Der schimmernde Rahmen
        // sagt dasselbe wie ein Spinner – nur an der Stelle, an der gleich das
        // Motiv steht, und ohne die Kachel zu verändern, wenn es soweit ist.
        <Skeleton radius="none" />
      ) : (
        <span className="text-ink-500 absolute inset-1 grid place-items-center text-center text-[10px] leading-tight break-all">
          {alt}
        </span>
      )}
      {/* Das Format steht am Rahmen und nicht darunter: eine Bildunterschrift je
          Rahmen wäre eine dritte Textzeile in einer Kachel, die zwei hat. */}
      <span className="bg-ink-900/70 absolute bottom-0.5 left-0.5 rounded px-1 text-[9px] font-medium text-white">
        {ratio}
      </span>
      {onCrop && (
        <span className="bg-ink-900/70 absolute top-0.5 right-0.5 rounded p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Sign meaning="edit" size={12} />
        </span>
      )}
    </Tag>
  );
}

/** Die Fläche, auf der die Rahmen stehen – in jeder Kachel gleich hoch. */
function Stage({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="bg-canvas relative flex h-36 items-center justify-center gap-1.5 rounded-lg p-1.5">
      {children}
      {overlay && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">{overlay}</div>
      )}
    </div>
  );
}

/** Kopfzeile: was das für ein Inhalt ist, links – was man damit tun kann, rechts. */
function TileHeader({
  badge,
  tone = "default",
  hasWarning,
  children,
}: {
  badge: string;
  tone?: "default" | "loose" | "busy" | "error";
  hasWarning?: boolean;
  children?: ReactNode;
}) {
  const badgeTone = {
    default: "border-line text-ink-700 bg-surface",
    loose: "border-gold-500 text-gold-700 bg-gold-100",
    busy: "border-line text-ink-500 bg-surface",
    error: "border-danger text-danger-700 bg-attention",
  }[tone];
  return (
    <div className="flex min-h-7 items-center justify-between gap-1">
      <span
        className={`truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeTone}`}
      >
        {badge}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {hasWarning && (
          <span className="text-warning-700">
            <Sign meaning="warning" size={15} />
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

/** Die eine Zeile unter dem Namen: Warnung, Herkunft oder was Meta daraus macht. */
function TileNote({ text, tone = "muted" }: { text: string; tone?: "muted" | "warn" }) {
  return (
    <p
      title={text}
      className={`line-clamp-2 text-[11px] leading-tight ${
        tone === "warn" ? "text-danger-700" : "text-ink-500"
      }`}
    >
      {text}
    </p>
  );
}

type TileAction = { id: string; label: string; run: () => void };

function ActionsMenu({ label, actions }: { label: string; actions: TileAction[] }) {
  return (
    <DropdownMenu
      button={{ label, isIconOnly: true, icon: <Sign meaning="moreActions" />, variant: "ghost", size: "sm" }}
      items={actions.map((a) => ({ label: a.label, onClick: a.run }))}
    />
  );
}

/**
 * Der Kachelrahmen. Alles, was nicht editierbar ist – liegengebliebene Datei,
 * laufender Upload –, bekommt statt des Namensfeldes eine gleich hohe Zeile,
 * damit in einer Reihe nichts verrutscht.
 */
function Tile({
  tone = "default",
  isOver,
  children,
  ...rest
}: {
  tone?: "default" | "loose" | "error";
  isOver?: boolean;
  children: ReactNode;
} & React.LiHTMLAttributes<HTMLLIElement>) {
  const border = isOver
    ? "border-gold-500 ring-gold-500 ring-1"
    : tone === "error"
      ? "border-danger"
      : tone === "loose"
        ? "border-gold-500 border-dashed"
        : "border-line";
  return (
    <li
      {...rest}
      className={`bg-surface flex flex-col gap-2 rounded-xl border p-2 transition-colors ${border}`}
    >
      {children}
    </li>
  );
}

/** Statt des Namensfeldes, wo es nichts zu benennen gibt – gleiche Höhe. */
function TileName({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-10 items-center truncate px-1 text-sm font-medium">{children}</p>
  );
}

/** Eine Anzeige: ein Video (UGC), ein einzelnes Bild oder ein Paar (Split). */
export function AdTile({
  ad,
  adAccount,
  borrowers,
  onDropAsset,
  onRename,
  onDissolve,
  onSwap,
  onRemove,
  onCropped,
}: {
  ad: WizardAd;
  adAccount: string;
  borrowers: string[];
  onDropAsset: (looseId: string) => void;
  onRename: (name: string) => void;
  /** Zurück auf Anfang: die Motive dieser Anzeige liegen danach wieder ohne Anzeige. */
  onDissolve: () => void;
  onSwap: () => void;
  onRemove: () => void;
  onCropped: (slot: AssetSlot, cropped: WizardImageAsset) => void;
}) {
  const [over, setOver] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [crop, setCrop] = useState<AssetSlot | null>(null);
  const linked = Boolean(ad.source);
  // Ein Paar ist voll; alles mit einem Motiv nimmt noch eine zweite Hälfte auf.
  const takesAsset = ad.type === "ugc" || ad.type === "single";

  const badge =
    ad.type === "ugc" ? "UGC-Video" : ad.type === "single" ? "Einzelbild" : "Foto-Paar";

  // Nur was für diese eine Anzeige gilt: eine Warnung oder die Leihe. Was für
  // jede Anzeige ihrer Art gilt, stand vorher fünfzehnmal untereinander im
  // Raster und war damit keine Auskunft mehr, sondern Grundrauschen.
  const note = ad.warn
    ? { text: ad.warn, tone: "warn" as const }
    : linked
      ? { text: "Geliehen — Bearbeiten löst die Verbindung" }
      : ad.reason
        ? { text: ad.reason }
        : undefined;

  const actions: TileAction[] = [];
  if (adAccount && ad.type === "single") {
    actions.push({ id: "crop", label: "Zuschneiden", run: () => cropTo("asset", ad.asset.orientation === "portrait" ? "square" : "portrait") });
  }
  if (ad.type === "split") {
    if (adAccount && ad.portrait.kind === "image") {
      actions.push({ id: "crop-portrait", label: "9:16 zuschneiden", run: () => cropTo("portrait", "portrait") });
    }
    if (adAccount && ad.square.kind === "image") {
      actions.push({ id: "crop-square", label: "1:1 zuschneiden", run: () => cropTo("square", "square") });
    }
    // Die Ausrichtung kommt aus den Maßen, die Platzierung ist eine Entscheidung:
    // wer das Motiv im anderen Rahmen besser findet, tauscht sie hier.
    actions.push({ id: "swap", label: "Formate tauschen", run: onSwap });
  }
  actions.push({
    id: "dissolve",
    label: ad.type === "split" ? "Paar trennen" : "Anzeige auflösen",
    run: onDissolve,
  });
  // Fremden Inhalt nie als Nebenwirkung löschen: wer diese Anzeige leiht, steht
  // in der Rückfrage.
  actions.push({
    id: "remove",
    label: "Entfernen",
    run: () => (borrowers.length ? setConfirming(true) : onRemove()),
  });

  const cropAsset =
    ad.type === "single" && crop === "asset"
      ? ad.asset
      : ad.type === "split" && crop === "portrait"
        ? ad.portrait
        : ad.type === "split" && crop === "square"
          ? ad.square
          : undefined;
  // Ein Klick auf den Rahmen sagt schon, welches Format gemeint ist.
  const [cropTarget, setCropTarget] = useState<Orientation>();
  const cropTo = (slot: AssetSlot, target: Orientation) => {
    setCropTarget(target);
    setCrop(slot);
  };
  const canCrop = (a: WizardAsset) => adAccount && a.kind === "image";

  return (
    <Tile
      isOver={over}
      onDragOver={(e) => {
        if (!takesAsset) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!takesAsset) return;
        e.preventDefault();
        const looseId = e.dataTransfer.getData(DRAG_TYPE);
        if (looseId) onDropAsset(looseId);
      }}
    >
      <TileHeader badge={badge} hasWarning={Boolean(ad.warn)}>
        <ActionsMenu label={`Aktionen für ${ad.name}`} actions={actions} />
      </TileHeader>

      <Stage>
        {ad.type === "split" ? (
          <>
            <MediaFrame
              ratio="9:16"
              url={previewUrl(ad.portrait, adAccount)}
              alt={ad.portrait.fileName}
              onCrop={canCrop(ad.portrait) ? () => cropTo("portrait", "portrait") : undefined}
            />
            <MediaFrame
              ratio="1:1"
              url={previewUrl(ad.square, adAccount)}
              alt={ad.square.fileName}
              onCrop={canCrop(ad.square) ? () => cropTo("square", "square") : undefined}
            />
          </>
        ) : ad.type === "ugc" ? (
          <MediaFrame ratio="9:16" url={previewUrl(ad.asset, adAccount)} alt={ad.asset.fileName} />
        ) : (
          // Dasselbe Bild zweimal: genau das macht Meta mit einem Einzelbild,
          // und genau das ist hier zu sehen, bevor es jemand von Meta erfährt.
          // Ein Klick auf den Rahmen schneidet das Bild für genau dieses
          // Format zu – und aus dem Einzelbild wird ein Paar.
          <>
            <MediaFrame
              ratio="9:16"
              url={previewUrl(ad.asset, adAccount)}
              alt={ad.asset.fileName}
              onCrop={canCrop(ad.asset) ? () => cropTo("asset", "portrait") : undefined}
            />
            <MediaFrame
              ratio="1:1"
              url={previewUrl(ad.asset, adAccount)}
              alt={ad.asset.fileName}
              onCrop={canCrop(ad.asset) ? () => cropTo("asset", "square") : undefined}
            />
          </>
        )}
      </Stage>

      <TextInput label="Anzeigenname" isLabelHidden value={ad.name} onChange={onRename} width="100%" />

      {note && <TileNote {...note} />}

      {cropAsset?.kind === "image" && crop && (
        <CropDialog
          asset={cropAsset}
          adAccount={adAccount}
          isOpen
          // In einem Paar hat die Hälfte ihr Format; ein Einzelbild darf beides.
          targets={crop === "asset" ? undefined : [crop]}
          initialTarget={cropTarget}
          onOpenChange={(open) => {
            if (!open) setCrop(null);
          }}
          onCropped={(cropped) => {
            onCropped(crop, cropped);
            setCrop(null);
          }}
        />
      )}

      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title="Anzeige wird woanders verwendet"
        description={`„${ad.name}“ ist auch in ${borrowers.join(", ")} im Einsatz. Dort verschwindet der Inhalt mit.`}
        cancelLabel="Abbrechen"
        actionLabel="Trotzdem entfernen"
        onAction={() => {
          setConfirming(false);
          onRemove();
        }}
      />
    </Tile>
  );
}

/**
 * Hochgeladen, aber noch keiner Anzeige zugeordnet. Kein Fehlerzustand: die
 * Kachel ist dieselbe, nur gestrichelt umrandet und ziehbar.
 */
export function LooseTile({
  asset,
  adAccount,
  partners,
  onPairWith,
  onPromote,
  onCropped,
  onRemove,
}: {
  asset: WizardLooseAsset;
  adAccount: string;
  /** Die anderen liegengebliebenen Dateien im Gegenformat – fürs Paaren ohne Ziehen. */
  partners: { id: string; label: string }[];
  onPairWith: (draggedId: string) => void;
  /** Bild → Einzelbild-Anzeige, Video → UGC-Anzeige. */
  onPromote: () => void;
  onCropped: (cropped: WizardImageAsset) => void;
  onRemove: () => void;
}) {
  const [over, setOver] = useState(false);
  const [cropping, setCropping] = useState(false);
  const ratio: Ratio = asset.orientation === "portrait" ? "9:16" : "1:1";

  // Auch für Videos: ein getrenntes Paar legt sein Video hierher, und ohne
  // diesen Punkt bliebe es liegen, wo es nie hingehörte.
  const actions: TileAction[] = [{ id: "promote", label: "Als eigene Anzeige", run: onPromote }];
  // Ziehen ist der schnelle Weg, das Menü der sichere: ohne Maus, ohne Zielen.
  for (const p of partners)
    actions.push({ id: `pair-${p.id}`, label: `Paaren mit „${p.label}“`, run: () => onPairWith(p.id) });
  if (asset.kind === "image" && adAccount) {
    actions.push({
      id: "crop",
      label: asset.orientation === "portrait" ? "1:1 dazu zuschneiden" : "9:16 dazu zuschneiden",
      run: () => setCropping(true),
    });
  }
  actions.push({ id: "remove", label: "Entfernen", run: onRemove });

  return (
    <Tile
      tone="loose"
      isOver={over}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, asset.id)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dragged = e.dataTransfer.getData(DRAG_TYPE);
        if (dragged) onPairWith(dragged);
      }}
      className="cursor-grab"
    >
      <TileHeader badge="Ohne Anzeige" tone="loose">
        <ActionsMenu label={`Aktionen für ${asset.fileName}`} actions={actions} />
      </TileHeader>

      <Stage>
        <MediaFrame
          ratio={ratio}
          url={previewUrl(asset, adAccount)}
          alt={asset.fileName}
          onCrop={asset.kind === "image" && adAccount ? () => setCropping(true) : undefined}
        />
      </Stage>

      {/* Was man mit einer liegengebliebenen Datei tun kann, steht einmal im
          Hinweis über dem Raster und nicht an jeder einzelnen Kachel. */}
      <TileName>{cleanStem(asset.fileName)}</TileName>

      {cropping && asset.kind === "image" && (
        <CropDialog
          asset={asset}
          adAccount={adAccount}
          isOpen={cropping}
          onOpenChange={setCropping}
          onCropped={onCropped}
        />
      )}
    </Tile>
  );
}

const percent = (p?: number) => (p === undefined ? "" : ` · ${Math.round(p * 100)}%`);

export const phaseLabel = (u: UploadJob) =>
  u.error
    ? "Fehlgeschlagen"
    : {
        queued: "Wartet…",
        preparing: "Format wird geprüft…",
        converting: `Konvertierung zu MP4${percent(u.progress)}`,
        bundling: "Wartet auf den Schwung…",
        uploading: `Wird hochgeladen${percent(u.progress)}`,
        processing: "Meta verarbeitet…",
      }[u.phase];

/**
 * Nur wo der Abschnitt messbar ist (Konvertierung, Upload), steht ein Ring über
 * dem Motiv. Metas Verarbeitung meldet keinen Fortschritt – dort sagt der
 * schimmernde Rahmen, dass etwas läuft, und die Statuszeile darunter, was.
 */
const UploadIndicator = ({ upload }: { upload: UploadJob }) =>
  upload.progress === undefined ? null : (
    // Kein label: die Statuszeile unter der Kachel (TileNote) nennt dieselbe
    // Phase bereits sichtbar — ein zweiter Name hier würde doppelt angesagt.
    <ProgressRing value={upload.progress} />
  );

/**
 * Bilder lassen sich sofort zeigen – die Datei liegt im Browser, lange bevor
 * Meta einen Hash zurückgibt. Erzeugt wird die Adresse im Effekt und nicht im
 * Memo: React ruft Effekte in der Entwicklung doppelt auf, ein im Memo
 * erzeugter Blob wäre nach dem ersten Aufräumen tot.
 */
function useLocalPreview(file: File): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(undefined);
    };
  }, [file]);
  return url;
}

/**
 * Eine laufende Datei – in derselben Kachel, in der sie gleich als Anzeige
 * steht. Videos zeigen den Rahmen, den sie später füllen; Bilder zeigen sich
 * selbst, gedimmt unter dem Ring.
 */
export function UploadTile({ upload }: { upload: UploadJob }) {
  const local = useLocalPreview(upload.file);
  const isImage = upload.file.type.startsWith("image/");
  // Ein fehlgeschlagener Upload wartet auf nichts mehr – ein schimmernder
  // Rahmen würde das Gegenteil behaupten.
  const pending = !upload.error;

  return (
    <Tile tone={upload.error ? "error" : "default"} aria-live="polite">
      <TileHeader
        badge={upload.error ? "Fehlgeschlagen" : "Wird hochgeladen"}
        tone={upload.error ? "error" : "busy"}
      />

      <Stage
        overlay={
          upload.error ? (
            // Ein gezeichnetes Zeichen statt eines Ausrufezeichens aus der
            // Fließschrift: das „!" stand je nach Schnitt anders hoch und war
            // kein Zeichen, sondern Text, der zufällig wie eines aussah.
            <Sign meaning="warning" size={28} color="var(--color-text-red)" />
          ) : (
            <UploadIndicator upload={upload} />
          )
        }
      >
        {/* Dieselben Rahmen wie später: ein Video wird 9:16, ein Bild läuft in
            beiden Formaten. Deshalb springt beim Fertigwerden nichts. Ein Bild
            liegt schon im Browser und zeigt sich; ein Video schimmert, bis Meta
            sein Thumbnail liefert. */}
        <MediaFrame ratio="9:16" url={local} alt={upload.name} isDimmed isPending={pending} />
        {isImage && (
          <MediaFrame ratio="1:1" url={local} alt={upload.name} isDimmed isPending={pending} />
        )}
      </Stage>

      <TileName>{cleanStem(upload.name)}</TileName>
      <TileNote
        text={upload.error ?? (upload.note ? `${phaseLabel(upload)} · unkonvertiert` : phaseLabel(upload))}
        tone={upload.error ? "warn" : "muted"}
      />
    </Tile>
  );
}

/**
 * Ein Raster statt einer Papierrolle, und begrenzt hoch: fünfzehn Anzeigen
 * dürfen den Schritt nicht so lang machen, dass die Textfelder darunter
 * unerreichbar werden. Was nicht ins Fenster passt, wird gescrollt – der
 * Schatten am Rand sagt, dass da noch etwas ist.
 */
export function ContentGrid({ children }: { children: ReactNode }) {
  // .scroll-fade ersetzt HeroUIs ScrollShadow (app/globals.css).
  return (
    <div className="scroll-fade max-h-[34rem] px-0.5 py-1">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{children}</ul>
    </div>
  );
}
