"use client";

/**
 * Eine Drive-Datei ansehen, bevor sie zu Meta geht: Video spielt über
 * /api/drive?file= (Range durchgereicht, also spulbar), ein Bild zeigt sich
 * selbst. Dazu der Sprung in Drive – für alles, was hier nicht geht
 * (umbenennen, verschieben, den Ordner aufräumen).
 */

import { Button, Dialog, DialogHeader, Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core";
import { ArrowSquareOutIcon, EyeIcon, PlayIcon } from "@phosphor-icons/react";
import { driveUrl, type DriveFile } from "@/lib/drive";

export function DrivePreview({ file, onClose }: { file?: DriveFile; onClose: () => void }) {
  const src = file ? `/api/drive?file=${encodeURIComponent(file.id)}` : "";
  return (
    <Dialog isOpen={Boolean(file)} onOpenChange={(open) => !open && onClose()} width={560} maxHeight="90vh">
      {file && (
        <Layout
          header={<DialogHeader title={file.name} onOpenChange={(open) => !open && onClose()} />}
          content={
            <LayoutContent>
              <div className="bg-ink-900 flex max-h-[65vh] items-center justify-center overflow-hidden rounded-lg">
                {file.mimeType.startsWith("video/") ? (
                  // Ein MOV mit HEVC spielt in Safari und in Chrome auf Macs mit
                  // HEVC-Hardware; spielt es nicht, bleibt der Sprung in Drive.
                  <video src={src} controls autoPlay playsInline className="max-h-[65vh] w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={file.name} className="max-h-[65vh] w-full object-contain" />
                )}
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="flex items-center justify-end gap-3">
                <Button
                  variant="secondary"
                  label="In Drive öffnen"
                  icon={<ArrowSquareOutIcon />}
                  href={driveUrl(file)}
                  target="_blank"
                  rel="noreferrer"
                />
                <Button label="Schließen" onClick={onClose} />
              </div>
            </LayoutFooter>
          }
        />
      )}
    </Dialog>
  );
}

/** Der kleine Abspielknopf in der Ecke einer Kachel – als Geschwister, nie im Kachelknopf (Knopf im Knopf ist kein HTML). */
export function PreviewCorner({ file, onPreview }: { file: DriveFile; onPreview: (f: DriveFile) => void }) {
  return (
    <button
      type="button"
      aria-label={`${file.name} ansehen`}
      onClick={(e) => {
        e.stopPropagation();
        onPreview(file);
      }}
      className="bg-ink-900/70 hover:bg-ink-900 focus-visible:ring-gold-500 absolute right-1.5 bottom-1.5 z-10 rounded-full p-1.5 text-white focus-visible:ring-2 focus-visible:outline-none"
    >
      {file.mimeType.startsWith("video/") ? <PlayIcon size={12} weight="fill" aria-hidden /> : <EyeIcon size={12} weight="bold" aria-hidden />}
    </button>
  );
}
