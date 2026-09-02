"use client";

/**
 * Ein Explorer für den Kundenordner in Drive – statt Videos von Hand herunter-
 * und wieder hochzuladen. Der Server sucht den Ordner zum Kundennamen und
 * öffnet ihn gleich am besten Tipp (lib/drive.ts, landing); von dort lässt
 * sich jeder Schritt korrigieren: Ordner sind Ordner (Reihe oben, Symbol,
 * kein Vorschaubild), Dateien sind Kacheln mit Drives Vorschaubild, die
 * Brotkrumen führen zurück, die Suche findet auch andere Kunden. Abgehakt
 * wird ordnerübergreifend – die Auswahl überlebt das Umherlaufen. Die Dateien
 * kommen als gewöhnliche File-Objekte beim Dateiwähler an; ab da ist es
 * derselbe Weg wie vom Finder.
 */

import { useEffect, useState } from "react";
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
  Skeleton,
  Text,
  TextInput,
  useToast,
} from "@astryxdesign/core";
import {
  CheckIcon,
  FolderSimpleIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import type { DriveFolder, DriveSearch } from "@/app/api/drive/route";
import type { DriveFile } from "@/lib/drive";
import { createGate } from "@/lib/gate";

/** Mehr gleichzeitig hieße mehr Videos zugleich im Speicher des Browsers. */
const DOWNLOAD_LANES = 3;
const FOLDER = "application/vnd.google-apps.folder";
const isFolder = (f: DriveFile) => f.mimeType === FOLDER;

async function ask<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`/api/drive?${new URLSearchParams(params)}`);
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function DriveDialog({
  isOpen,
  onOpenChange,
  business,
  onFiles,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Der Kundenname aus dem Assistenten – die Vorbelegung der Suche. */
  business: string;
  onFiles: (files: File[]) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState(business);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  /** Leer heißt: die Trefferliste ist zu sehen. */
  const [path, setPath] = useState<DriveFile[]>([]);
  const [entries, setEntries] = useState<DriveFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Map<string, DriveFile>>(new Map());
  const [fetching, setFetching] = useState<{ done: number; total: number } | null>(null);

  const guarded = async (work: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const search = (q: string) =>
    guarded(async () => {
      setFolders([]);
      setPath([]);
      setEntries([]);
      setSearched(Boolean(q.trim()));
      if (!q.trim()) return;
      const { folders, landed } = await ask<DriveSearch>({ q: q.trim() });
      setFolders(folders);
      if (landed) {
        setPath(landed.path);
        setEntries(landed.entries);
        // Vorgewählt, was am Landeplatz liegt: der Normalfall ist „alle Videos dieses Kunden“.
        setSelected(new Map(landed.entries.filter((f) => !isFolder(f)).map((f) => [f.id, f])));
      }
    });

  /** In einen Ordner – `trail` ist der Weg dorthin, samt ihm selbst. */
  const open = (trail: DriveFile[]) =>
    guarded(async () => {
      const target = trail[trail.length - 1];
      const { entries } = await ask<DriveFolder>({ folder: target.id });
      setPath(trail);
      setEntries(entries);
    });

  useEffect(() => {
    if (!isOpen) return;
    setQuery(business);
    setSelected(new Map());
    void search(business);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setMany = (files: DriveFile[], on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const f of files) on ? next.set(f.id, f) : next.delete(f.id);
      return next;
    });

  const take = async () => {
    const wanted = [...selected.values()];
    if (!wanted.length) return;
    setFetching({ done: 0, total: wanted.length });
    const gate = createGate(DOWNLOAD_LANES);
    const files: File[] = [];
    const failed: string[] = [];
    await Promise.all(
      wanted.map(async (m) => {
        await gate.acquire();
        try {
          const res = await fetch(`/api/drive?file=${encodeURIComponent(m.id)}`);
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(json.error ?? `HTTP ${res.status}`);
          }
          files.push(new File([await res.blob()], m.name, { type: m.mimeType }));
        } catch {
          failed.push(m.name);
        } finally {
          gate.release();
          setFetching((p) => p && { ...p, done: p.done + 1 });
        }
      }),
    );
    setFetching(null);
    if (failed.length)
      toast({ type: "error", body: <div>{`Nicht aus Drive geladen: ${failed.join(", ")}`}</div> });
    if (files.length) onFiles(files);
    onOpenChange(false);
  };

  const count = selected.size;
  const busy = loading || fetching !== null;
  const inFolder = path.length > 0;
  const subfolders = entries.filter(isFolder);
  const media = entries.filter((f) => !isFolder(f));
  const hereSelected = media.filter((m) => selected.has(m.id)).length;
  const allHere = media.length > 0 && hereSelected === media.length;

  return (
    <Dialog isOpen={isOpen} onOpenChange={busy ? () => {} : onOpenChange} width={920}>
      <Layout
        header={<DialogHeader title="Aus Google Drive" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-5">
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search(query);
                }}
              >
                <TextInput
                  label="Kundenordner"
                  value={query}
                  onChange={setQuery}
                  width="100%"
                  placeholder="Name des Kunden"
                  isDisabled={busy}
                />
                <Button
                  variant="secondary"
                  label="Suchen"
                  type="submit"
                  icon={<MagnifyingGlassIcon />}
                  isDisabled={busy}
                />
              </form>

              {/* Brotkrumen: „Treffer“ ist die Trefferliste, danach der Weg in den Ordner. */}
              {loading && !folders.length ? (
                <Skeleton height={20} width={260} radius={1} />
              ) : (
                folders.length > 0 && (
                  <Breadcrumbs label="Ordnerpfad">
                    <BreadcrumbItem isCurrent={!inFolder} onClick={() => setPath([])}>
                      Treffer
                    </BreadcrumbItem>
                    {path.map((f, i) => (
                      <BreadcrumbItem
                        key={f.id}
                        isCurrent={i === path.length - 1}
                        onClick={() => void open(path.slice(0, i + 1))}
                      >
                        {f.name}
                      </BreadcrumbItem>
                    ))}
                  </Breadcrumbs>
                )
              )}

              {error && (
                <Text type="supporting" as="p">
                  {error}
                </Text>
              )}

              {loading ? (
                <ExplorerSkeleton />
              ) : !inFolder ? (
                // Die Trefferliste: lauter Ordner, gleich anklickbar.
                folders.length > 0 ? (
                  <Section title={`${folders.length} ${folders.length === 1 ? "Ordner" : "Ordner"} gefunden`}>
                    <FolderRow folders={folders} onOpen={(f) => void open([f])} />
                  </Section>
                ) : (
                  searched &&
                  !error && (
                    <Text type="supporting" as="p">
                      Kein Ordner gefunden. Der Kundenordner muss für das Dienstkonto freigegeben
                      sein – oder der Name heißt in Drive anders.
                    </Text>
                  )
                )
              ) : (
                <>
                  {subfolders.length > 0 && (
                    <Section title="Ordner">
                      <FolderRow folders={subfolders} onOpen={(f) => void open([...path, f])} />
                    </Section>
                  )}
                  {media.length > 0 && (
                    <Section
                      title={`${media.length} ${media.length === 1 ? "Datei" : "Dateien"}`}
                      // Die Auswahl-Knöpfe stehen bei den Dateien, auf die sie wirken –
                      // nicht unten neben „Übernehmen“, wo sie wie ein weiterer Abschluss aussähen.
                      actions={
                        <Button
                          variant="ghost"
                          size="sm"
                          label={allHere ? "Alle hier abwählen" : "Alle hier auswählen"}
                          onClick={() => setMany(media, !allHere)}
                          isDisabled={fetching !== null}
                        />
                      }
                    >
                      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
                        {media.map((m) => (
                          <FileTile
                            key={m.id}
                            file={m}
                            isSelected={selected.has(m.id)}
                            onToggle={(on) => setMany([m], on)}
                            isDisabled={fetching !== null}
                          />
                        ))}
                      </ul>
                    </Section>
                  )}
                  {!entries.length && (
                    <Text type="supporting" as="p">
                      Dieser Ordner ist leer.
                    </Text>
                  )}
                </>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex items-center gap-3">
              <Text type="supporting" as="div" className="min-w-0 flex-1 truncate">
                {fetching
                  ? `${fetching.done} von ${fetching.total} geladen …`
                  : count
                    ? `${count} ${count === 1 ? "Datei" : "Dateien"} ausgewählt`
                    : "Nichts ausgewählt"}
              </Text>
              <Button
                variant="secondary"
                label="Abbrechen"
                onClick={() => onOpenChange(false)}
                isDisabled={fetching !== null}
              />
              <Button
                label={count ? `${count} übernehmen` : "Übernehmen"}
                onClick={() => void take()}
                isDisabled={busy || !count}
                isLoading={fetching !== null}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

// ------------------------------------------------------------------ Bausteine

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <Text type="supporting" as="h3" className="font-semibold">
          {title}
        </Text>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Ordner sehen nach Ordnern aus: eine Reihe schmaler Karten mit Symbol, kein Vorschaubild. */
function FolderRow({ folders, onOpen }: { folders: DriveFile[]; onOpen: (f: DriveFile) => void }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {folders.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => onOpen(f)}
            className="bg-surface-secondary border-line hover:border-gold-500 focus-visible:ring-gold-500 flex max-w-xs items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
          >
            <FolderSimpleIcon size={20} weight="fill" className="text-gold-500 shrink-0" />
            <span className="truncate">{f.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Eine Datei: Vorschaubild, Häkchen oben links, Video-Zeichen unten rechts, Name darunter. */
function FileTile({
  file,
  isSelected,
  onToggle,
  isDisabled,
}: {
  file: DriveFile;
  isSelected: boolean;
  onToggle: (on: boolean) => void;
  isDisabled: boolean;
}) {
  const [thumb, setThumb] = useState<"loading" | "ready" | "none">(
    file.hasThumbnail ? "loading" : "none",
  );
  const isVideo = file.mimeType.startsWith("video/");
  const size = file.size ? `${Math.round(Number(file.size) / 1e6)} MB` : "";

  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={file.name}
        disabled={isDisabled}
        onClick={() => onToggle(!isSelected)}
        className={`group flex w-full flex-col gap-1.5 rounded-lg text-left focus-visible:outline-none ${
          isDisabled ? "opacity-60" : ""
        }`}
      >
        <div
          className={`bg-canvas relative aspect-square w-full overflow-hidden rounded-lg border transition-colors ${
            isSelected ? "border-gold-500 ring-gold-500 ring-2" : "border-line group-hover:border-gold-500"
          }`}
        >
          {thumb === "loading" && (
            <div className="absolute inset-0">
              <Skeleton radius="none" />
            </div>
          )}
          {thumb !== "none" ? (
            <img
              src={`/api/drive?thumb=${encodeURIComponent(file.id)}`}
              alt=""
              loading="lazy"
              onLoad={() => setThumb("ready")}
              onError={() => setThumb("none")}
              className={`h-full w-full object-cover transition-opacity ${thumb === "ready" ? "opacity-100" : "opacity-0"}`}
            />
          ) : (
            <div className="text-ink-500 flex h-full w-full items-center justify-center">
              {isVideo ? <PlayIcon size={28} /> : <ImageIcon size={28} />}
            </div>
          )}
          {/* Das Häkchen: immer sichtbar, damit Auswahl und Nicht-Auswahl gleich klar sind. */}
          <span
            className={`absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
              isSelected ? "bg-gold-500 border-gold-500 text-white" : "bg-surface/90 border-line"
            }`}
            aria-hidden
          >
            {isSelected && <CheckIcon size={12} weight="bold" />}
          </span>
          {isVideo && thumb === "ready" && (
            <span
              className="bg-ink-900/70 absolute right-1.5 bottom-1.5 rounded-full p-1 text-white"
              aria-hidden
            >
              <PlayIcon size={12} weight="fill" />
            </span>
          )}
        </div>
        <span className="min-w-0 px-0.5">
          <span className="block truncate text-xs font-medium">{file.name}</span>
          {size && <span className="text-ink-500 block text-[11px]">{size}</span>}
        </span>
      </button>
    </li>
  );
}

/** Während Drive antwortet: die Form dessen, was gleich dasteht – Ordnerreihe und Kachelraster. */
function ExplorerSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="space-y-2">
        <Skeleton height={16} width={80} radius={1} />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={38} width={160} radius={2} index={i} />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton height={16} width={80} radius={1} index={3} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="aspect-square w-full">
                <Skeleton radius={2} index={4 + i} />
              </div>
              <Skeleton height={12} width="80%" radius={1} index={4 + i} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
