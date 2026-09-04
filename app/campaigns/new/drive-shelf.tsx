"use client";

/**
 * Das Drive-Regal: der Kundenordner, schon geöffnet, direkt im Vorschlag.
 * Vorher lag zwischen „Dateien wählen“ und den Videos ein Dialog, eine Suche
 * und ein Klick durch die Ordner – dabei weiß lib/drive.ts längst, wo sie
 * liegen (und ClickUp sagt es manchmal sogar). Nichts geht ohne Klick zu Meta:
 * „Alle übernehmen“ ist der eine, den es braucht; einzelne Kacheln gehen auch.
 * Schon übernommene Dateien sind ausgegraut – der zweite Klick lädt nichts
 * doppelt. Der Dialog bleibt für den Fall, dass der Tipp falsch ist.
 */

import { useEffect, useState } from "react";
import { Banner, Button, Skeleton, Text } from "@astryxdesign/core";
import { FolderSimpleIcon, ImageIcon, PlayIcon } from "@phosphor-icons/react";
import type { DriveSearch } from "@/app/api/drive/route";
import type { DriveFile } from "@/lib/drive";
import { plural } from "@/lib/labels";
import { DriveDialog } from "./drive-dialog";
import { report } from "./activity";

const FOLDER = "application/vnd.google-apps.folder";
const isMedia = (f: DriveFile) => f.mimeType !== FOLDER;

export function DriveShelf({
  business,
  folderId,
  hint,
  taken,
  onFiles,
}: {
  business: string;
  /** Aus ClickUp – dann startet das Regal dort statt bei der Namenssuche. */
  folderId?: string;
  /** Ort und Rollen der Aufgabe – wählen unter datierten Unterordnern („13.9.26 FK Renningen“). */
  hint?: string[];
  /** Dateinamen, die schon in der Anzeigengruppe liegen (Anzeigen, Ablage, laufende Uploads). */
  taken: ReadonlySet<string>;
  /** Die Einträge selbst, nicht ihre Bytes: die Warteschlange holt, was sie braucht. */
  onFiles: (files: DriveFile[]) => void;
}) {
  const [path, setPath] = useState<DriveFile[]>([]);
  const [entries, setEntries] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState(false);

  const hintKey = (hint ?? []).filter(Boolean).join(",");
  useEffect(() => {
    if (!business.trim() && !folderId) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    const label = "Drive-Regal";
    report({ id: "regal", label, status: "running", detail: "öffnet den Kundenordner, holt Videos und Bilder…" });
    const params: Record<string, string> = folderId ? { land: folderId } : { q: business.trim() };
    if (hintKey) params.hint = hintKey;
    fetch(`/api/drive?${new URLSearchParams(params)}`)
      .then(async (res) => {
        const json = (await res.json()) as DriveSearch & { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        const path = json.landed?.path ?? [];
        const entries = json.landed?.entries ?? [];
        setPath(path);
        setEntries(entries);
        const n = entries.filter(isMedia).length;
        report({
          id: "regal",
          label,
          status: path.length ? "done" : "failed",
          detail: path.length
            ? `${path.map((p) => p.name).join(" › ")} · ${plural(n, "Datei", "Dateien")}`
            : "kein Ordner gefunden – Dateien unten hineinziehen",
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        report({ id: "regal", label, status: "failed", detail: e.message });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [business, folderId, hintKey]);

  const media = entries.filter(isMedia);
  const open = media.filter((m) => !taken.has(m.name));

  const take = (wanted: DriveFile[]) => wanted.length && onFiles(wanted);

  return (
    <div className="bg-surface-secondary border-line space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderSimpleIcon size={18} weight="bold" className="text-ink-500 shrink-0" aria-hidden />
          <Text type="supporting" as="span" className="truncate">
            {loading
              ? "Drive-Ordner wird gesucht…"
              : path.length
                ? path.map((p) => p.name).join(" › ")
                : "Kein Drive-Ordner gefunden"}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {open.length > 0 && (
            <Button
              size="sm"
              label={`Alle übernehmen (${open.length})`}
              onClick={() => take(open)}
            />
          )}
          <Button size="sm" variant="secondary" label="Anderen Ordner wählen" onClick={() => setDialog(true)} />
        </div>
      </div>

      {error && <Banner status="error" title="Drive nicht erreichbar" description={error} />}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={96} width="100%" radius={2} index={i} />
          ))}
        </div>
      ) : media.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
          {media.map((m) => {
            const done = taken.has(m.name);
            const video = m.mimeType.startsWith("video/");
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={done}
                  aria-label={done ? `${m.name} – schon übernommen` : `${m.name} übernehmen`}
                  onClick={() => take([m])}
                  className={[
                    "border-line bg-surface relative block aspect-square w-full overflow-hidden rounded-lg border text-left",
                    "focus-visible:ring-focus outline-none focus-visible:ring-2",
                    done ? "cursor-default opacity-40" : "hover:border-gold-500 cursor-pointer",
                  ].join(" ")}
                >
                  {m.hasThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/drive?thumb=${encodeURIComponent(m.id)}`} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-ink-300 flex size-full items-center justify-center">
                      {video ? <PlayIcon size={28} /> : <ImageIcon size={28} />}
                    </span>
                  )}
                  <span className="bg-ink-900/70 absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5 text-[11px] text-white">
                    {m.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        !error && (
          <Text type="supporting" as="p">
            {path.length
              ? "In diesem Ordner liegen keine Videos oder Bilder."
              : "Dateien unten hineinziehen oder einen Ordner wählen."}
          </Text>
        )
      )}
      {media.length > 0 && (
        <Text type="supporting" as="p" className="text-xs">
          {plural(media.length, "Datei", "Dateien")}
          {open.length < media.length && ` · ${media.length - open.length} schon übernommen`}
        </Text>
      )}

      <DriveDialog isOpen={dialog} onOpenChange={setDialog} business={business} onFiles={onFiles} />
    </div>
  );
}
