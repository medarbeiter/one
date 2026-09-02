"use client";

/**
 * Die UGC-Videos direkt aus dem Kundenordner in Drive holen, statt sie von
 * Hand herunter- und wieder hochzuladen. Der Server sucht den Ordner zum
 * Kundennamen und öffnet ihn gleich am besten Tipp (lib/drive.ts, landing);
 * von dort lässt sich jeder Schritt korrigieren: Unterordner sind anklickbar,
 * die Brotkrumen führen zurück, und die Suche findet auch andere Kunden.
 * Abgehakt wird ordnerübergreifend – die Auswahl überlebt das Umherlaufen.
 * Die Dateien kommen als gewöhnliche File-Objekte beim Dateiwähler an; ab da
 * ist es derselbe Weg wie vom Finder.
 */

import { useEffect, useState } from "react";
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  CheckboxInput,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
  Spinner,
  Text,
  TextInput,
  useToast,
} from "@astryxdesign/core";
import { FolderSimpleIcon } from "@phosphor-icons/react";
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

  const toggle = (file: DriveFile, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(file.id, file);
      else next.delete(file.id);
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
  const subfolders = entries.filter(isFolder);
  const media = entries.filter((f) => !isFolder(f));
  const allHere = media.length > 0 && media.every((m) => selected.has(m.id));

  return (
    <Dialog isOpen={isOpen} onOpenChange={busy ? () => {} : onOpenChange}>
      <Layout
        header={<DialogHeader title="Aus Google Drive" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-4">
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
                <Button variant="secondary" label="Suchen" type="submit" isDisabled={busy} />
              </form>

              {folders.length > 0 && (
                <Breadcrumbs label="Ordnerpfad">
                  <BreadcrumbItem isCurrent={!path.length} onClick={() => setPath([])}>
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
              )}

              {loading && (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <Text type="supporting">Drive wird gelesen …</Text>
                </div>
              )}
              {error && (
                <Text type="supporting" as="p">
                  {error}
                </Text>
              )}
              {!loading && !error && !folders.length && query.trim() && (
                <Text type="supporting" as="p">
                  Kein Ordner gefunden. Der Kundenordner muss für das Dienstkonto freigegeben sein –
                  oder der Name heißt in Drive anders.
                </Text>
              )}

              {!loading && !path.length && folders.length > 0 && (
                <FolderList folders={folders} onOpen={(f) => void open([f])} />
              )}

              {!loading && path.length > 0 && (
                <>
                  {subfolders.length > 0 && (
                    <FolderList folders={subfolders} onOpen={(f) => void open([...path, f])} />
                  )}
                  {media.length > 0 && (
                    <div className="space-y-2">
                      <CheckboxInput
                        label={allHere ? "Alle hier abwählen" : "Alle hier auswählen"}
                        value={allHere ? true : media.some((m) => selected.has(m.id)) ? "indeterminate" : false}
                        onChange={(on) =>
                          setSelected((prev) => {
                            const next = new Map(prev);
                            for (const m of media) on ? next.set(m.id, m) : next.delete(m.id);
                            return next;
                          })
                        }
                        isDisabled={fetching !== null}
                      />
                      {media.map((m) => (
                        <CheckboxInput
                          key={m.id}
                          label={`${m.name}${m.size ? ` · ${Math.round(Number(m.size) / 1e6)} MB` : ""}`}
                          value={selected.has(m.id)}
                          onChange={(on) => toggle(m, on)}
                          isDisabled={fetching !== null}
                        />
                      ))}
                    </div>
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
            <div className="flex items-center justify-end gap-2">
              {fetching && (
                <Text type="supporting">{`${fetching.done} von ${fetching.total} geladen …`}</Text>
              )}
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
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

function FolderList({ folders, onOpen }: { folders: DriveFile[]; onOpen: (f: DriveFile) => void }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {folders.map((f) => (
        <Button
          key={f.id}
          variant="ghost"
          size="sm"
          icon={<FolderSimpleIcon />}
          label={f.name}
          onClick={() => onOpen(f)}
        />
      ))}
    </div>
  );
}
