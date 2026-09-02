"use client";

import { useEffect, useRef, useState } from "react";
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

export function CropDialog({
  asset,
  adAccount,
  isOpen,
  onOpenChange,
  onCropped,
  targets = ["portrait", "square"],
  initialTarget,
}: {
  asset: WizardImageAsset;
  adAccount: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (cropped: WizardImageAsset) => void;
  /** Welche Formate zur Wahl stehen – in einem Paar nur das der Hälfte. */
  targets?: Orientation[];
  initialTarget?: Orientation;
}) {
  // Voreinstellung ist das Format, das noch fehlt: ein quadratisches Bild wird
  // hier meistens zum Hochformat gemacht, nicht umgekehrt.
  const [target, setTarget] = useState<Orientation>(
    initialTarget ??
      (targets.includes(asset.orientation === "portrait" ? "square" : "portrait")
        ? asset.orientation === "portrait"
          ? "square"
          : "portrait"
        : targets[0]),
  );
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const img = useRef<HTMLImageElement>(null);
  const frameEl = useRef<HTMLDivElement>(null);
  /** Alle gedrückten Zeiger – einer schiebt, zwei kneifen. */
  const pointers = useRef(new Map<number, Point>());

  const frame = FRAMES[target];
  // Ein zweiter Zuschnitt geht vom Original aus, nicht vom ersten Ausschnitt.
  const sourceHash = asset.sourceHash ?? asset.hash;
  const sourceFileName = asset.sourceFileName ?? asset.fileName;
  const src = imagePreviewUrl(sourceHash, adAccount);

  // Der Rahmen muss immer vollständig gefüllt sein – deshalb "cover" als
  // Grundmaß, und der Zoom setzt darauf auf.
  const base = natural ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1;
  // Der Zoom endet, wo der Ausschnitt unter Metas Mindestbreite fiele. Ein
  // Bild, das schon ungezoomt darunter liegt, darf trotzdem zugeschnitten
  // werden – nur nicht noch weiter vergrößert.
  const maxZoom = natural ? Math.max(1, Math.min(MAX_ZOOM, frame.w / base / MIN_WIDTH)) : 1;
  const shown = natural
    ? { w: natural.w * base * zoom, h: natural.h * base * zoom }
    : { w: frame.w, h: frame.h };

  // Geklemmt wird beim Zeichnen, nicht in einem Effekt: so steht nie für ein
  // Bild lang ein leerer Streifen im Rahmen.
  const clamp = (o: Point, s = shown): Point => ({
    x: Math.min(0, Math.max(frame.w - s.w, o.x)),
    y: Math.min(0, Math.max(frame.h - s.h, o.y)),
  });
  const pos = clamp(offset);

  // Mittig starten: der Ausschnitt, den auch Meta nähme – nur eben verschiebbar.
  const center = (n: { w: number; h: number }, f = frame) => {
    const b = Math.max(f.w / n.w, f.h / n.h);
    setOffset({ x: (f.w - n.w * b) / 2, y: (f.h - n.h * b) / 2 });
  };

  const reset = () => {
    setZoom(1);
    if (natural) center(natural);
  };

  /**
   * Zoomen um einen Punkt im Rahmen: was unter dem Zeiger liegt, bleibt unter
   * dem Zeiger. Vorher zoomte der Regler um die linke obere Ecke – das Motiv
   * lief dabei aus dem Bild.
   */
  const zoomAt = (next: number, pivot: Point) => {
    const z = Math.min(maxZoom, Math.max(1, next));
    if (z === zoom) return;
    const k = z / zoom;
    const s = natural ? { w: natural.w * base * z, h: natural.h * base * z } : shown;
    setOffset(clamp({ x: pivot.x - (pivot.x - pos.x) * k, y: pivot.y - (pivot.y - pos.y) * k }, s));
    setZoom(z);
  };
  const frameCenter = { x: frame.w / 2, y: frame.h / 2 };

  // Das Rad zoomt. Als React-Handler wäre der Listener passiv und die Seite
  // scrollte mit – deshalb von Hand und mit preventDefault.
  useEffect(() => {
    const el = frameEl.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(zoom * Math.exp(-e.deltaY * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

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
      setOffset(clamp({ x: pos.x + now.x - was.x, y: pos.y + now.y - was.y }));
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
    const s = natural ? { w: natural.w * base * z, h: natural.h * base * z } : shown;
    setOffset(clamp({ x: mid.x - (mid.x - shifted.x) * k, y: mid.y - (mid.y - shifted.y) * k }, s));
    setZoom(z);
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
    if (nudge[e.key]) setOffset(clamp({ x: pos.x + nudge[e.key].x, y: pos.y + nudge[e.key].y }));
    else if (e.key === "+" || e.key === "=") zoomAt(zoom * 1.1, frameCenter);
    else if (e.key === "-") zoomAt(zoom / 1.1, frameCenter);
    else if (e.key === "0") reset();
    else return;
    e.preventDefault();
  };

  const switchTarget = (o: Orientation) => {
    setTarget(o);
    setZoom(1);
    if (natural) center(natural, FRAMES[o]);
  };

  async function apply() {
    const el = img.current;
    if (!el || !natural) return;
    setBusy(true);
    setError(undefined);
    try {
      const scale = base * zoom;
      // Vom Rahmen zurück in die Pixel der Datei.
      const sw = frame.w / scale;
      const sh = frame.h / scale;
      const sx = -pos.x / scale;
      const sy = -pos.y / scale;

      // Das Ziel im exakten Verhältnis – nicht im gerundeten des Rahmens.
      const tw = Math.max(1, Math.round(Math.min(MAX_WIDTH, sw)));
      const th = Math.max(1, Math.round(tw * frame.ratio));

      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Der Browser stellt kein Canvas bereit.");
      // JPEG kennt keine Transparenz – ohne diesen Grund würde sie schwarz.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(el, sx, sy, sw, sh, 0, 0, tw, th);

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (!blob) throw new Error("Der Zuschnitt konnte nicht erzeugt werden.");

      // Der Name trägt das Format: in Metas Bildbibliothek stehen sonst zwei
      // Dateien gleichen Namens nebeneinander. Ein altes Kürzel fällt vorher
      // weg – „Lea 9x16 1x1.jpg“ wäre ein Widerspruch im Namen.
      const stem = splitFormatToken(sourceFileName).stem;
      const fileName = `${stem} ${target === "portrait" ? "9x16" : "1x1"}.jpg`;
      const fd = new FormData();
      fd.set("file", new File([blob], fileName, { type: "image/jpeg" }));
      fd.set("adAccount", adAccount);
      const json = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (json.error) throw new Error(json.error);

      onCropped({
        kind: "image",
        hash: json.hash,
        fileName,
        orientation: target,
        // Dasselbe Motiv, also derselbe Fingerabdruck – die Paarung erkennt es weiter.
        fingerprint: asset.fingerprint,
        sourceHash,
        sourceFileName,
      });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canZoom = maxZoom > 1;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Layout
        header={<DialogHeader title="Bild zuschneiden" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-3">
              {targets.length > 1 && (
                <div className="flex gap-2">
                  {targets.map((o) => (
                    <Button
                      key={o}
                      size="sm"
                      variant={target === o ? "primary" : "secondary"}
                      label={FRAMES[o].label}
                      onClick={() => switchTarget(o)}
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
                  aria-label={`Ausschnitt ${FRAMES[target].label}. Pfeiltasten verschieben, Plus und Minus zoomen, 0 setzt zurück.`}
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
                  {/* Gleicher Ursprung über app/api/image – ein fremd geladenes
                      Bild würde das Canvas sperren und der Zuschnitt käme nie
                      wieder heraus. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={img}
                    src={src}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      const n = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
                      setNatural(n);
                      center(n);
                    }}
                    onError={() => setError("Das Bild konnte nicht geladen werden.")}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                      width: shown.w,
                      height: shown.h,
                      left: pos.x,
                      top: pos.y,
                      visibility: natural ? "visible" : "hidden",
                    }}
                  />
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
              <Button
                variant="secondary"
                label="Abbrechen"
                onClick={() => onOpenChange(false)}
                isDisabled={busy}
              />
              <Button
                label={busy ? "Wird hochgeladen…" : "Zuschneiden & übernehmen"}
                onClick={apply}
                isDisabled={busy || !natural}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
