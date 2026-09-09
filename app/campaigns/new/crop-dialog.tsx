"use client";

import { useRef, useState } from "react";
import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
  Spinner,
} from "@astryxdesign/core";
import { imagePreviewUrl, splitFormatToken, type Orientation } from "@/lib/media";
import type { WizardImageAsset } from "./state";

/**
 * Zuschneiden statt neu exportieren. Die Bilder kommen aus einem Sammelordner
 * und sind selten schon 9:16 oder 1:1 – Meta beschneidet sie dann selbst, und
 * zwar mittig und ohne Rücksicht darauf, wo der Kopf sitzt. Hier wird der
 * Ausschnitt einmal gewählt und als eigenes Bild hochgeladen.
 *
 * Beide Formate in einem Dialog: jede Seite hat ihr eigenes Bild, ihren Zoom
 * und ihren Ausschnitt. Wer zwischen 9:16 und 1:1 wechselt, verliert nichts.
 * Übernommen wird, was angefasst wurde – und die Seite, mit der der Dialog
 * aufging, immer. Das Hochladen läuft danach im Hintergrund weiter; die
 * Kachel zeigt so lange, dass sie wartet.
 *
 * Gerechnet wird in drei Größen, die auseinanderzuhalten sind:
 * - **natürlich**: die Pixel der Datei (nw × nh)
 * - **Rahmen**: der sichtbare Ausschnitt in CSS-Pixeln (fw × fh)
 * - **Ziel**: was hochgeladen wird, höchstens 1080 breit
 *
 * Der Rahmen hat exakt das Zielverhältnis (225/400 = 9/16), sonst wäre der
 * Ausschnitt um einen Streifen breiter als die hochgeladene Datei.
 */

const FRAMES: Record<Orientation, { w: number; h: number; ratio: number; label: string }> = {
  portrait: { w: 225, h: 400, ratio: 16 / 9, label: "9:16 · Story, Reels" },
  square: { w: 320, h: 320, ratio: 1, label: "1:1 · Feed" },
};

/** Breiter braucht Meta es nicht; alles darüber wird ohnehin heruntergerechnet. */
const MAX_WIDTH = 1080;
/** Schmaler will Meta es nicht: darunter wird das Bild im Feed unscharf. Deckelt den Zoom. */
const MIN_WIDTH = 600;
const MAX_ZOOM = 4;

type Point = { x: number; y: number };
type Size = { w: number; h: number };

/** Eine Seite des Dialogs: welches Format aus welchem Bild geschnitten wird. */
export type CropSide = { target: Orientation; asset: WizardImageAsset };

type Edit = { zoom: number; offset: Point; natural?: Size; touched: boolean };
const BLANK: Edit = { zoom: 1, offset: { x: 0, y: 0 }, touched: false };

// Ein zweiter Zuschnitt geht vom Original aus, nicht vom ersten Ausschnitt.
const sourceOf = (a: WizardImageAsset) => ({
  hash: a.sourceHash ?? a.hash,
  fileName: a.sourceFileName ?? a.fileName,
});

/**
 * Die Geometrie einer Seite. Der Rahmen muss immer vollständig gefüllt sein –
 * deshalb "cover" als Grundmaß, und der Zoom setzt darauf auf. Der Zoom endet,
 * wo der Ausschnitt unter Metas Mindestbreite fiele; ein Bild, das schon
 * ungezoomt darunter liegt, darf trotzdem zugeschnitten werden.
 */
function geometry(frame: Size, e: Edit) {
  const n = e.natural;
  const base = n ? Math.max(frame.w / n.w, frame.h / n.h) : 1;
  const maxZoom = n ? Math.max(1, Math.min(MAX_ZOOM, frame.w / base / MIN_WIDTH)) : 1;
  const sizeAt = (z: number): Size => (n ? { w: n.w * base * z, h: n.h * base * z } : frame);
  const clamp = (o: Point, s = sizeAt(e.zoom)): Point => ({
    x: Math.min(0, Math.max(frame.w - s.w, o.x)),
    y: Math.min(0, Math.max(frame.h - s.h, o.y)),
  });
  return { base, maxZoom, sizeAt, clamp, shown: sizeAt(e.zoom), pos: clamp(e.offset) };
}

// Mittig starten: der Ausschnitt, den auch Meta nähme – nur eben verschiebbar.
const centered = (frame: Size, n: Size): Point => {
  const b = Math.max(frame.w / n.w, frame.h / n.h);
  return { x: (frame.w - n.w * b) / 2, y: (frame.h - n.h * b) / 2 };
};

async function upload(side: CropSide, blob: Blob, adAccount: string): Promise<WizardImageAsset> {
  const source = sourceOf(side.asset);
  // Der Name trägt das Format: in Metas Bildbibliothek stehen sonst zwei
  // Dateien gleichen Namens nebeneinander. Ein altes Kürzel fällt vorher
  // weg – „Lea 9x16 1x1.jpg“ wäre ein Widerspruch im Namen.
  const stem = splitFormatToken(source.fileName).stem;
  const fileName = `${stem} ${side.target === "portrait" ? "9x16" : "1x1"}.jpg`;
  const fd = new FormData();
  fd.set("file", new File([blob], fileName, { type: "image/jpeg" }));
  fd.set("adAccount", adAccount);
  const json = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
  if (json.error) throw new Error(json.error);
  return {
    kind: "image",
    hash: json.hash,
    fileName,
    orientation: side.target,
    // Dasselbe Motiv, also derselbe Fingerabdruck – die Paarung erkennt es weiter.
    fingerprint: side.asset.fingerprint,
    sourceHash: source.hash,
    sourceFileName: source.fileName,
  };
}

export function CropDialog({
  sides,
  initialTarget,
  adAccount,
  onOpenChange,
  onApply,
}: {
  sides: CropSide[];
  adAccount: string;
  initialTarget?: Orientation;
  onOpenChange: (open: boolean) => void;
  /** Die Uploads laufen weiter, wenn der Dialog schon zu ist – die Kachel wartet darauf. */
  onApply: (result: Promise<WizardImageAsset[]>) => void;
}) {
  const first = initialTarget ?? sides[0].target;
  const [target, setTarget] = useState<Orientation>(first);
  const [edits, setEdits] = useState<Partial<Record<Orientation, Edit>>>({});
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const imgs = useRef<Partial<Record<Orientation, HTMLImageElement | null>>>({});
  const frameEl = useRef<HTMLDivElement>(null);
  /** Alle gedrückten Zeiger – einer schiebt, zwei kneifen. */
  const pointers = useRef(new Map<number, Point>());

  const frame = FRAMES[target];
  const edit = edits[target] ?? BLANK;
  const { natural, zoom } = edit;
  const g = geometry(frame, edit);
  const { pos, shown, maxZoom } = g;

  const patch = (o: Orientation, p: Partial<Edit>) =>
    setEdits((e) => ({ ...e, [o]: { ...(e[o] ?? BLANK), ...p } }));
  // Geklemmt wird beim Zeichnen, nicht in einem Effekt: so steht nie für ein
  // Bild lang ein leerer Streifen im Rahmen.
  const setOffset = (offset: Point) => patch(target, { offset, touched: true });

  const reset = () => natural && patch(target, { zoom: 1, offset: centered(frame, natural), touched: true });

  /**
   * Zoomen um einen Punkt im Rahmen: was unter dem Zeiger liegt, bleibt unter
   * dem Zeiger. Vorher zoomte der Regler um die linke obere Ecke – das Motiv
   * lief dabei aus dem Bild.
   */
  const zoomAt = (next: number, pivot: Point) => {
    const z = Math.min(maxZoom, Math.max(1, next));
    if (z === zoom) return;
    const k = z / zoom;
    const offset = g.clamp({ x: pivot.x - (pivot.x - pos.x) * k, y: pivot.y - (pivot.y - pos.y) * k }, g.sizeAt(z));
    patch(target, { zoom: z, offset, touched: true });
  };

  const frameCenter = { x: frame.w / 2, y: frame.h / 2 };

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = frameEl.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const was = pointers.current.get(e.pointerId);
    if (!was) return;
    const now = local(e);
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    pointers.current.set(e.pointerId, now);

    if (others.length === 0) {
      setOffset(g.clamp({ x: pos.x + now.x - was.x, y: pos.y + now.y - was.y }));
      return;
    }
    // Zwei Finger: der Abstand ist der Zoom, die Mitte der Drehpunkt – und wer
    // beide Finger zugleich schiebt, schiebt das Bild.
    const [, other] = others[0];
    const before = Math.hypot(was.x - other.x, was.y - other.y);
    const after = Math.hypot(now.x - other.x, now.y - other.y);
    const mid = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
    const midWas = { x: (was.x + other.x) / 2, y: (was.y + other.y) / 2 };
    const shifted = { x: pos.x + mid.x - midWas.x, y: pos.y + mid.y - midWas.y };
    const z = Math.min(maxZoom, Math.max(1, before ? zoom * (after / before) : zoom));
    const k = z / zoom;
    const offset = g.clamp({ x: mid.x - (mid.x - shifted.x) * k, y: mid.y - (mid.y - shifted.y) * k }, g.sizeAt(z));
    patch(target, { zoom: z, offset, touched: true });
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) setDragging(false);
  };

  // Pfeile schieben, Plus/Minus zoomen, 0 setzt zurück – für alle, die keine
  // Maus in der Hand haben, und für den letzten Millimeter.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 10;
    const nudge: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    if (nudge[e.key]) setOffset(g.clamp({ x: pos.x + nudge[e.key].x, y: pos.y + nudge[e.key].y }));
    else if (e.key === "+" || e.key === "=") zoomAt(zoom * 1.1, frameCenter);
    else if (e.key === "-") zoomAt(zoom / 1.1, frameCenter);
    else if (e.key === "0") reset();
    else return;
    e.preventDefault();
  };

  /** Die Ausschnitte werden hier gezeichnet, solange die Bilder noch im DOM stehen; hochgeladen wird danach. */
  function apply() {
    const jobs: { side: CropSide; blob: Promise<Blob | null> }[] = [];
    for (const side of sides) {
      const e = edits[side.target];
      const el = imgs.current[side.target];
      if (!e?.natural || !el || !(e.touched || side.target === first)) continue;
      const f = FRAMES[side.target];
      const { base, pos } = geometry(f, e);
      const scale = base * e.zoom;
      // Vom Rahmen zurück in die Pixel der Datei.
      const sw = f.w / scale;
      const sh = f.h / scale;
      const sx = -pos.x / scale;
      const sy = -pos.y / scale;

      // Das Ziel im exakten Verhältnis – nicht im gerundeten des Rahmens.
      const tw = Math.max(1, Math.round(Math.min(MAX_WIDTH, sw)));
      const th = Math.max(1, Math.round(tw * f.ratio));

      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Der Browser stellt kein Canvas bereit.");
        return;
      }
      // JPEG kennt keine Transparenz – ohne diesen Grund würde sie schwarz.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(el, sx, sy, sw, sh, 0, 0, tw, th);
      jobs.push({ side, blob: new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92)) });
    }
    if (jobs.length) {
      onApply(
        Promise.all(
          jobs.map(async ({ side, blob }) => {
            const b = await blob;
            if (!b) throw new Error("Der Zuschnitt konnte nicht erzeugt werden.");
            return upload(side, b, adAccount);
          }),
        ),
      );
    }
    onOpenChange(false);
  }

  const canZoom = maxZoom > 1;

  return (
    <Dialog isOpen onOpenChange={onOpenChange}>
      <Layout
        header={<DialogHeader title="Bild zuschneiden" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-3">
              {sides.length > 1 && (
                <div className="flex gap-2">
                  {sides.map((s) => (
                    <Button
                      key={s.target}
                      size="sm"
                      variant={target === s.target ? "primary" : "secondary"}
                      label={FRAMES[s.target].label}
                      onClick={() => setTarget(s.target)}
                    />
                  ))}
                </div>
              )}

              {/* Der Rahmen zeigt genau das, was hochgeladen wird – geschoben
                  wird das Bild dahinter, nicht der Rahmen. */}
              <div className="flex justify-center">
                <div
                  ref={frameEl}
                  role="img"
                  aria-label={`Ausschnitt ${frame.label}. Pfeiltasten verschieben, Plus und Minus zoomen, 0 setzt zurück.`}
                  tabIndex={0}
                  className="border-line bg-surface focus-visible:ring-gold-500 relative touch-none overflow-hidden rounded-xl border outline-none focus-visible:ring-2"
                  style={{ width: frame.w, height: frame.h, cursor: dragging ? "grabbing" : "grab" }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerEnd}
                  onPointerCancel={onPointerEnd}
                  onDoubleClick={reset}
                  onKeyDown={onKeyDown}
                >
                  {!natural && !error && (
                    <div className="grid h-full place-items-center">
                      <Spinner />
                    </div>
                  )}
                  {/* Ein Bild je Seite, alle geladen: beim Übernehmen müssen
                      alle Ausschnitte auf einmal gezeichnet werden. Gleicher
                      Ursprung über app/api/image – ein fremd geladenes Bild
                      würde das Canvas sperren und der Zuschnitt käme nie
                      wieder heraus. */}
                  {sides.map((s) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={s.target}
                      ref={(el) => {
                        imgs.current[s.target] = el;
                      }}
                      src={imagePreviewUrl(sourceOf(s.asset).hash, adAccount)}
                      alt=""
                      draggable={false}
                      onLoad={(e) => {
                        const n = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
                        patch(s.target, { natural: n, offset: centered(FRAMES[s.target], n) });
                      }}
                      onError={() => setError("Das Bild konnte nicht geladen werden.")}
                      className="pointer-events-none absolute select-none"
                      // Astryx' Reset (:where(img) { max-width: 100% }) liegt in
                      // @layer astryx-base hinter Tailwinds Utilities – `max-w-none`
                      // verliert, das Bild würde auf Rahmenbreite gestaucht. Inline
                      // schlägt jede Ebene.
                      style={
                        s.target === target
                          ? {
                              maxWidth: "none",
                              width: shown.w,
                              height: shown.h,
                              left: pos.x,
                              top: pos.y,
                              visibility: natural ? "visible" : "hidden",
                            }
                          : { display: "none" }
                      }
                    />
                  ))}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-ink-500 flex justify-between text-xs">
                  <span>Zoom</span>
                  <span>
                    {canZoom
                      ? "Ziehen verschiebt · Rad oder Kneifen zoomt · Doppelklick setzt zurück"
                      : natural
                        ? "Das Bild ist zu klein, um es weiter zu vergrößern"
                        : ""}
                  </span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={maxZoom}
                  step={0.01}
                  value={zoom}
                  disabled={!canZoom}
                  onChange={(e) => zoomAt(Number(e.target.value), frameCenter)}
                  className="w-full"
                  aria-label="Zoom"
                />
              </label>

              {error && <Banner status="error" title={error} />}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" label="Abbrechen" onClick={() => onOpenChange(false)} />
              <Button label="Zuschneiden & übernehmen" onClick={apply} isDisabled={!edits[first]?.natural} />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
