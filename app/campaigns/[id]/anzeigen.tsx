"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertDialog, Badge, Button, Dialog, FileInput, Heading, SegmentedControl, SegmentedControlItem, Switch, Text, useToast } from "@astryxdesign/core";
import * as UI from "@/app/shell/ui";
import { Card } from "@/app/shell/ui";
import { Sign } from "@/theme/icons";
import { PREVIEW_FORMATS, results, type Ad, type Period, type PreviewFormat } from "@/lib/campaigns";
import { creativeTexts } from "@/lib/seed";
import { label } from "@/lib/labels";
import type { FormatAsset } from "@/lib/launch";
import { addAdAction, adPreviewAction, deleteAdAction, setAdStatusAction } from "../actions";
import { kennzahl, money, zahl } from "../kennzahlen";
import { Kacheln } from "./kacheln";

/**
 * Die Anzeigen einer Anzeigengruppe: Karte je Anzeige mit Motiv, Zahlen,
 * Vorschau, Texten, Schalter und Entfernen – und der Weg, eine neue dazu zu
 * legen, ohne durch den Assistenten zu müssen. Jede Handlung, die Geld oder
 * Bestand berührt, fragt nach.
 */
export function Anzeigen({
  campaignId,
  adAccount,
  adsetId,
  ads,
  period,
}: {
  campaignId: string;
  adAccount?: string;
  adsetId: string;
  ads: Ad[];
  period: Period;
}) {
  const [texte, setTexte] = useState(false);
  const sichtbar = ads.filter((a) => a.status !== "DELETED");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text type="supporting" size="sm" color="secondary">
          {sichtbar.length} {sichtbar.length === 1 ? "Anzeige" : "Anzeigen"}
        </Text>
        <span className="ml-auto flex items-center gap-2">
          <Switch value={texte} onChange={setTexte} label="Texte zeigen" />
          {adAccount && sichtbar.some((a) => a.creative?.object_story_spec) && (
            <NeueAnzeige campaignId={campaignId} adAccount={adAccount} adsetId={adsetId} />
          )}
        </span>
      </div>
      {sichtbar.length === 0 ? (
        <UI.EmptyState title="Diese Anzeigengruppe hat noch keine Anzeigen." isCompact />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {sichtbar.map((ad) => (
            <li key={ad.id}>
              <AnzeigeKarte campaignId={campaignId} ad={ad} period={period} texte={texte} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnzeigeKarte({ campaignId, ad, period, texte }: { campaignId: string; ad: Ad; period: Period; texte: boolean }) {
  const [pending, start] = useTransition();
  const [frage, setFrage] = useState<"ACTIVE" | "PAUSED" | "DELETE" | null>(null);
  const [vorschau, setVorschau] = useState(false);
  const toast = useToast();
  const i = ad.insights[period];
  const live = ad.status === "ACTIVE";
  const t = creativeTexts(ad.creative);
  const istVideo = Boolean(ad.creative?.video_id || ad.creative?.object_story_spec?.video_data);

  const tu = (was: "ACTIVE" | "PAUSED" | "DELETE") =>
    start(async () => {
      const r =
        was === "DELETE"
          ? await deleteAdAction(campaignId, ad.id)
          : await setAdStatusAction(campaignId, ad.id, was);
      toast({ body: r.error ?? r.ok ?? "", type: r.error ? "error" : "info" });
    });

  return (
    <Card elevation="low" variant="muted">
      <UI.CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setVorschau(true)}
            title="Vorschau öffnen"
            className="relative shrink-0 overflow-hidden rounded-lg"
          >
            {ad.creative?.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ad.creative.thumbnail_url} alt="" className="size-24 object-cover" />
            ) : (
              <span className="bg-ink-100 flex size-24 items-center justify-center">
                <Sign meaning={istVideo ? "video" : "image"} color="var(--color-icon-secondary)" />
              </span>
            )}
            <span className="absolute right-1 bottom-1 rounded bg-white/90 p-0.5">
              <Sign meaning="preview" size={14} />
            </span>
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{ad.name}</span>
              <Badge variant={live ? "success" : "neutral"} label={label(ad.status)} />
              <Badge variant="neutral" label={istVideo ? "Video" : "Bild"} />
            </div>
            <Text type="supporting" size="sm" color="secondary" hasTabularNumbers>
              {zahl(results(i))} Leads · {money(kennzahl("cpl").wert(i))} je Lead
            </Text>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Switch
                value={live}
                isDisabled={pending || ad.status === "ARCHIVED"}
                label={live ? "Aktiv" : "Pausiert"}
                aria-label={`Status von ${ad.name}`}
                onChange={(on) => setFrage(on ? "ACTIVE" : "PAUSED")}
              />
              <Button variant="secondary" size="sm" icon={<Sign meaning="preview" />} label="Vorschau" onClick={() => setVorschau(true)} />
              <Button variant="secondary" size="sm" icon={<Sign meaning="remove" />} label="Entfernen" isDisabled={pending} onClick={() => setFrage("DELETE")} />
            </div>
          </div>
        </div>

        <Kacheln insights={i} kompakt />

        {texte && (
          <dl className="space-y-2 border-t pt-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
            <Textzeile name={t.bodies.length > 1 ? "Primärtexte" : "Primärtext"} werte={t.bodies} />
            <Textzeile name={t.titles.length > 1 ? "Überschriften" : "Überschrift"} werte={t.titles} />
            <Textzeile name="Beschreibung" werte={[t.description]} />
            <Textzeile name="Button" werte={[t.callToAction ? label(t.callToAction) : ""]} />
            <Textzeile name="Formular" werte={[t.formId]} />
          </dl>
        )}
      </UI.CardContent>

      <AlertDialog
        isOpen={frage !== null}
        onOpenChange={(open) => !open && setFrage(null)}
        title={frage === "DELETE" ? "Anzeige entfernen?" : frage === "PAUSED" ? "Anzeige pausieren?" : "Anzeige live schalten?"}
        description={
          frage === "DELETE"
            ? `„${ad.name}“ wird bei Meta gelöscht. Ihre Zahlen bleiben in der Kampagne, die Anzeige kommt nicht zurück.`
            : frage === "PAUSED"
              ? `„${ad.name}“ liefert ab sofort nicht mehr aus.`
              : `„${ad.name}“ liefert ab sofort aus, sobald die Anzeigengruppe läuft.`
        }
        cancelLabel="Abbrechen"
        actionLabel={frage === "DELETE" ? "Entfernen" : frage === "PAUSED" ? "Pausieren" : "Live schalten"}
        actionVariant={frage === "DELETE" ? "destructive" : "primary"}
        onAction={() => {
          const was = frage;
          setFrage(null);
          if (was) tu(was);
        }}
      />

      <Vorschau adId={ad.id} name={ad.name} isOpen={vorschau} onOpenChange={setVorschau} />
    </Card>
  );
}

function Textzeile({ name, werte }: { name: string; werte: string[] }) {
  const voll = werte.filter(Boolean);
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-ink-500 text-xs">{name}</dt>
      <dd className="space-y-1">
        {voll.length ? voll.map((w, i) => <p key={i} className="whitespace-pre-wrap">{w}</p>) : <span className="text-ink-500">—</span>}
      </dd>
    </div>
  );
}

/** Metas eigene Vorschau als iframe – erst geholt, wenn der Dialog aufgeht. */
function Vorschau({ adId, name, isOpen, onOpenChange }: { adId: string; name: string; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const [format, setFormat] = useState<PreviewFormat>("MOBILE_FEED_STANDARD");
  const [html, setHtml] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string>();

  useEffect(() => {
    if (!isOpen || html[format]) return;
    let aktuell = true;
    setFehler(undefined);
    adPreviewAction(adId, format).then((r) => {
      if (!aktuell) return;
      if (r.html) setHtml((h) => ({ ...h, [format]: r.html! }));
      else setFehler(r.error);
    });
    return () => {
      aktuell = false;
    };
  }, [isOpen, format, adId, html]);

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="info" width={640}>
      <div className="flex flex-col gap-4">
        <Heading level={2}>{name}</Heading>
        <SegmentedControl label="Platzierung" value={format} onChange={(v) => setFormat(v as PreviewFormat)} size="sm">
          {PREVIEW_FORMATS.map(([wert, text]) => (
            <SegmentedControlItem key={wert} value={wert} label={text} />
          ))}
        </SegmentedControl>
        <div className="flex min-h-[720px] justify-center overflow-auto">
          {fehler ? (
            <span className="text-sm" style={{ color: "var(--color-error)" }}>{fehler}</span>
          ) : html[format] ? (
            <div className="vorschau" dangerouslySetInnerHTML={{ __html: html[format] }} />
          ) : (
            <UI.Skeleton className="h-[720px] w-[360px] rounded-lg" />
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Motiv hochladen, Texte von den Geschwistern – ein Dialog, eine Rückfrage. */
function NeueAnzeige({ campaignId, adAccount, adsetId }: { campaignId: string; adAccount: string; adsetId: string }) {
  const [offen, setOffen] = useState(false);
  const [datei, setDatei] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [pending, start] = useTransition();
  const toast = useToast();

  const zu = () => {
    setOffen(false);
    setDatei(null);
    setName("");
    setFehler(undefined);
  };

  async function anlegen() {
    if (!datei) return;
    setLaden(true);
    setFehler(undefined);
    try {
      const fd = new FormData();
      fd.set("file", datei);
      fd.set("type", datei.type);
      fd.set("adAccount", adAccount);
      const json = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (json.error) throw new Error(json.error);
      const stem = (name.trim() || datei.name).replace(/\.[a-z0-9]+$/i, "");
      const asset: FormatAsset =
        json.kind === "video"
          ? { kind: "video", videoId: json.id, thumbnailUrl: json.thumbnail, fileName: datei.name }
          : { kind: "image", hash: json.hash, fileName: datei.name };
      start(async () => {
        const r = await addAdAction(campaignId, adsetId, { name: stem, asset });
        if (r.error) setFehler(r.error);
        else {
          toast({ body: r.ok ?? "", type: "info" });
          zu();
        }
        setLaden(false);
      });
    } catch (e) {
      setFehler((e as Error).message);
      setLaden(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" icon={<Sign meaning="add" />} label="Anzeige hinzufügen" onClick={() => setOffen(true)} />
      <Dialog isOpen={offen} onOpenChange={(o) => (o ? setOffen(true) : zu())} purpose="form" width={480}>
        <div className="flex flex-col gap-4">
          <Heading level={2}>Anzeige hinzufügen</Heading>
          <Text type="supporting" size="sm" color="secondary">
            Texte, Formular und Seite übernimmt die neue Anzeige von den anderen in dieser Gruppe. Sie wird pausiert angelegt.
          </Text>
          <FileInput
            label="Bild oder Video"
            accept="image/jpeg,image/png,video/*"
            mode="dropzone"
            value={datei}
            onChange={(f) => {
              const d = Array.isArray(f) ? f[0] ?? null : f;
              setDatei(d);
              if (d && !name) setName(d.name.replace(/\.[a-z0-9]+$/i, ""));
            }}
            isDisabled={laden || pending}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-500 text-xs">Name der Anzeige</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--color-border-emphasized)" }}
              disabled={laden || pending}
            />
          </label>
          {fehler && <span className="text-sm" style={{ color: "var(--color-error)" }}>{fehler}</span>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" label="Abbrechen" onClick={zu} isDisabled={laden || pending} />
            <Button variant="primary" label={laden || pending ? "Wird angelegt…" : "Anlegen"} isDisabled={!datei || laden || pending} isLoading={laden || pending} onClick={anlegen} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
