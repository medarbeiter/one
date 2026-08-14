"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Spinner } from "@heroui/react";
import { imagePreviewUrl, stripExtension, type Orientation } from "@/lib/media";
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
 */

const FRAMES: Record<Orientation, { w: number; h: number; label: string }> = {
  portrait: { w: 203, h: 360, label: "9:16 · Story, Reels" },
  square: { w: 300, h: 300, label: "1:1 · Feed" },
};

/** Breiter braucht Meta es nicht; alles darüber wird ohnehin heruntergerechnet. */
const MAX_WIDTH = 1080;

export function CropDialog({
  asset,
  adAccount,
  isOpen,
  onOpenChange,
  onCropped,
}: {
  asset: WizardImageAsset;
  adAccount: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (cropped: WizardImageAsset) => void;
}) {
  // Voreinstellung ist das Format, das noch fehlt: ein quadratisches Bild wird
  // hier meistens zum Hochformat gemacht, nicht umgekehrt.
  const [target, setTarget] = useState<Orientation>(
    asset.orientation === "portrait" ? "square" : "portrait",
  );
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const frame = FRAMES[target];
  const src = imagePreviewUrl(asset.hash, adAccount);

  // Der Rahmen muss immer vollständig gefüllt sein – deshalb "cover" als
  // Grundmaß, und der Zoom setzt darauf auf.
  const base = natural ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1;
  const shown = natural
    ? { w: natural.w * base * zoom, h: natural.h * base * zoom }
    : { w: frame.w, h: frame.h };

  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(frame.w - shown.w, o.x)),
    y: Math.min(0, Math.max(frame.h - shown.h, o.y)),
  });

  // Formatwechsel und Zoom verschieben die Grenzen; ohne Nachziehen bliebe ein
  // Streifen des Rahmens leer.
  useEffect(() => {
    setOffset((o) => clamp(o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, zoom, natural]);

  // Mittig starten: der Ausschnitt, den auch Meta nähme – nur eben verschiebbar.
  const center = (n: { w: number; h: number }) => {
    const b = Math.max(frame.w / n.w, frame.h / n.h);
    setOffset({ x: (frame.w - n.w * b) / 2, y: (frame.h - n.h * b) / 2 });
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
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;

      const tw = Math.round(Math.min(MAX_WIDTH, sw));
      const th = Math.round(tw * (frame.h / frame.w));

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
      // Dateien gleichen Namens nebeneinander.
      const fileName = `${stripExtension(asset.fileName)} ${target === "portrait" ? "9x16" : "1x1"}.jpg`;
      const fd = new FormData();
      fd.set("file", new File([blob], fileName, { type: "image/jpeg" }));
      fd.set("adAccount", adAccount);
      const json = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (json.error) throw new Error(json.error);

      onCropped({ kind: "image", hash: json.hash, fileName, orientation: target });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Bild zuschneiden</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-3">
              <div className="flex gap-2">
                {(Object.keys(FRAMES) as Orientation[]).map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant={target === o ? "primary" : "outline"}
                    onPress={() => {
                      setTarget(o);
                      setZoom(1);
                      if (natural) {
                        const f = FRAMES[o];
                        const b = Math.max(f.w / natural.w, f.h / natural.h);
                        setOffset({
                          x: (f.w - natural.w * b) / 2,
                          y: (f.h - natural.h * b) / 2,
                        });
                      }
                    }}
                  >
                    {FRAMES[o].label}
                  </Button>
                ))}
              </div>

              {/* Der Rahmen zeigt genau das, was hochgeladen wird – geschoben
                  wird das Bild dahinter, nicht der Rahmen. */}
              <div className="flex justify-center">
                <div
                  className="border-line bg-surface relative touch-none overflow-hidden rounded-xl border"
                  style={{ width: frame.w, height: frame.h, cursor: drag.current ? "grabbing" : "grab" }}
                  onPointerDown={(e) => {
                    drag.current = { x: e.clientX, y: e.clientY };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!drag.current) return;
                    const dx = e.clientX - drag.current.x;
                    const dy = e.clientY - drag.current.y;
                    drag.current = { x: e.clientX, y: e.clientY };
                    setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }));
                  }}
                  onPointerUp={() => (drag.current = null)}
                  onPointerCancel={() => (drag.current = null)}
                >
                  {!natural && (
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
                    alt={asset.fileName}
                    draggable={false}
                    onLoad={(e) => {
                      const n = {
                        w: e.currentTarget.naturalWidth,
                        h: e.currentTarget.naturalHeight,
                      };
                      setNatural(n);
                      center(n);
                    }}
                    onError={() => setError("Das Bild konnte nicht geladen werden.")}
                    className="absolute max-w-none select-none"
                    style={{
                      width: shown.w,
                      height: shown.h,
                      left: offset.x,
                      top: offset.y,
                      visibility: natural ? "visible" : "hidden",
                    }}
                  />
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-ink-500 text-xs">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                  aria-label="Zoom"
                />
              </label>

              {error && (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onPress={() => onOpenChange(false)} isDisabled={busy}>
                Abbrechen
              </Button>
              <Button onPress={apply} isDisabled={busy || !natural}>
                {busy ? "Wird hochgeladen…" : "Zuschneiden & ersetzen"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
