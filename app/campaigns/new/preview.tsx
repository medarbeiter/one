"use client";

import { useState } from "react";
import { Button, Card, Selector, Tab, TabList } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { imagePreviewUrl } from "@/lib/media";
import type { WizardAd, WizardAdSet, WizardAsset } from "./state";

/**
 * Die Vorschau als Telefon: Feed, Story und Reel so gebaut, wie Facebook und
 * Instagram sie zeigen – mit Seitenkopf, „Gesponsert“, CTA-Leiste und
 * abspielbaren Videos. Die Farben sind absichtlich Metas eigene und keine
 * Theme-Tokens: nachgeahmt wird eine fremde Oberfläche, die sich nicht nach
 * unserem Theme richten darf, sonst sieht sie nach uns aus statt nach Meta.
 */

type Surface = "feed" | "story" | "reel";

/** Welche Hälfte einer Anzeige auf welcher Fläche läuft. */
function assetFor(ad: WizardAd, want: "portrait" | "square"): WizardAsset {
  if (ad.type === "split") return want === "portrait" ? ad.portrait : ad.square;
  return ad.asset;
}

// ------------------------------------------------------------------- Medien

/**
 * Ein Video wie in der App: Poster, Tippen zum Abspielen, Ton-Schalter,
 * Schleife. Keine nativen Controls – die gibt es dort auch nicht.
 * Die Quelle kommt über /api/video, das die Video-ID gegen Metas
 * signierte CDN-Adresse eintauscht.
 */
function Video({ asset, fit }: { asset: Extract<WizardAsset, { kind: "video" }>; fit: string }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const toggle = (el: HTMLVideoElement | null) => {
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  return (
    <div className="relative h-full w-full">
      {/* Tastatur bedient das Video über die beiden Knöpfe darunter. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={`/api/video?id=${encodeURIComponent(asset.videoId)}`}
        poster={asset.thumbnailUrl}
        playsInline
        loop
        muted={muted}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={(e) => toggle(e.currentTarget)}
        className={`h-full w-full cursor-pointer ${fit}`}
      />
      {!playing && (
        <button
          type="button"
          aria-label="Video abspielen"
          onClick={(e) => toggle(e.currentTarget.parentElement?.querySelector("video") ?? null)}
          className="absolute inset-0 grid place-items-center"
        >
          <span className="grid size-14 place-items-center rounded-full bg-black/50 text-white">
            <svg viewBox="0 0 24 24" className="ml-1 size-7 fill-current" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
      <button
        type="button"
        aria-label={muted ? "Ton einschalten" : "Ton ausschalten"}
        onClick={() => setMuted(!muted)}
        className="absolute right-2 bottom-2 z-10 grid size-8 place-items-center rounded-full bg-black/50 text-white"
      >
        <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
          {muted ? (
            <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
          ) : (
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          )}
        </svg>
      </button>
    </div>
  );
}

/** Bild oder Video, die Fläche füllend. `key` beim Aufrufer wechselt das
 *  Video-Element mit, damit Abspielzustand nicht am falschen Clip hängt. */
function Media({
  asset,
  adAccount,
  fit,
}: {
  asset: WizardAsset;
  adAccount: string;
  fit: string;
}) {
  if (asset.kind === "video") return <Video asset={asset} fit={fit} />;
  const url = adAccount ? imagePreviewUrl(asset.hash, adAccount) : undefined;
  if (!url)
    return (
      <div className="grid h-full w-full place-items-center px-2 text-center text-xs text-white/70">
        <span className="truncate">{asset.fileName}</span>
      </div>
    );
  // Meta-CDN läuft über den eigenen Proxy, nicht über next/image (siehe app/api/image).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`h-full w-full ${fit}`} />;
}

/** Der angeschnittene nächste Beitrag unter der Anzeige: füllt die restliche
 *  Displayhöhe wie ein echter Feed, statt sie grau leer zu lassen. */
function GhostPost() {
  return (
    <div aria-hidden className="mt-2 rounded-lg bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="size-10 rounded-full bg-[#E4E6EB]" />
        <div className="space-y-1.5">
          <div className="h-2.5 w-28 rounded bg-[#E4E6EB]" />
          <div className="h-2 w-16 rounded bg-[#E4E6EB]" />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-2.5 w-full rounded bg-[#E4E6EB]" />
        <div className="h-2.5 w-3/4 rounded bg-[#E4E6EB]" />
      </div>
      <div className="mt-3 aspect-video rounded bg-[#E4E6EB]" />
    </div>
  );
}

/** Kein Medium gewählt – die Fläche sagt, was hierher gehört. */
function EmptyMedia({ dark }: { dark?: boolean }) {
  return (
    <div
      className={`grid h-full w-full place-items-center text-xs ${
        dark ? "bg-neutral-900 text-white/50" : "bg-[#F0F2F5] text-[#65676B]"
      }`}
    >
      Dein Bild oder Video
    </div>
  );
}

/** Das Seitenprofilbild von Graph – und wenn Meta es nicht herausgibt
 *  (Public-Content-Zugriff), der Anfangsbuchstabe im grauen Kreis. */
function Avatar({
  pageId,
  pageName,
  className,
}: {
  pageId: string;
  pageName: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (pageId && !failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://graph.facebook.com/${encodeURIComponent(pageId)}/picture?type=normal`}
        alt=""
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full bg-[#E4E6EB] object-cover ${className}`}
      />
    );
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-[#E4E6EB] font-semibold text-[#65676B] ${className}`}
    >
      {(pageName.trim() || "?").charAt(0).toUpperCase()}
    </div>
  );
}

// ------------------------------------------------------------------ Flächen

/** Der Facebook-Feed: weiße Karte, Seitenkopf, Primärtext mit „Mehr
 *  ansehen“, Medium, CTA-Leiste mit Überschrift, Reaktionszeile. */
function FeedSurface({
  ad,
  adAccount,
  pageId,
  pageName,
  body,
  title,
  description,
}: {
  ad?: WizardAd;
  adAccount: string;
  pageId: string;
  pageName: string;
  body: string;
  title: string;
  description: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const asset = ad && assetFor(ad, "square");
  // UGC-Videos sind hochkant; im Feed zeigt Meta sie auf 4:5 beschnitten.
  const aspect = asset?.kind === "video" && asset.orientation === "portrait" ? "aspect-[4/5]" : "aspect-square";
  const clamp = !expanded && body.length > 180;

  return (
    <div className="h-full overflow-y-auto bg-[#F0F2F5] p-2 [scrollbar-width:none]">
      <div className="overflow-hidden rounded-lg bg-white text-[#050505] shadow-sm">
        <div className="flex items-center gap-2 px-3 pt-3">
          <Avatar pageId={pageId} pageName={pageName} className="size-10 text-base" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{pageName || "Deine Seite"}</p>
            <p className="flex items-center gap-1 text-xs text-[#65676B]">
              Gesponsert ·
              <svg viewBox="0 0 16 16" className="size-3 fill-current" aria-hidden>
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm5.5 7c0 .57-.09 1.12-.25 1.64l-1.42-1.42a1 1 0 0 0-.71-.3H10v-1.5a.5.5 0 0 0-.5-.5H7V4.5h1.5a.5.5 0 0 0 .5-.5V2.55A5.5 5.5 0 0 1 13.5 8zM2.5 8c0-.62.1-1.21.29-1.77L5.5 8.94V10a1 1 0 0 0 1 1h.5v2.4A5.5 5.5 0 0 1 2.5 8z" />
              </svg>
            </p>
          </div>
          <span className="pb-2 text-lg leading-none tracking-widest text-[#65676B]">…</span>
        </div>

        <div className="px-3 py-2 text-[13px] leading-snug">
          <p className={`whitespace-pre-wrap ${clamp ? "line-clamp-4" : ""} ${body ? "" : "text-[#65676B] italic"}`}>
            {body || "Primärtext…"}
          </p>
          {clamp && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="font-semibold text-[#65676B]"
            >
              Mehr ansehen
            </button>
          )}
        </div>

        <div className={`${aspect} bg-black`}>
          {asset ? (
            <Media
              key={asset.kind === "video" ? asset.videoId : asset.hash}
              asset={asset}
              adAccount={adAccount}
              fit="object-cover"
            />
          ) : (
            <EmptyMedia />
          )}
        </div>

        <div className="flex items-center gap-2 bg-[#F0F2F5] px-3 py-2.5">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[10px] tracking-wide text-[#65676B] uppercase">Formular auf Facebook</p>
            <p className={`truncate text-[13px] font-semibold ${title ? "" : "text-[#65676B] italic"}`}>
              {title || "Überschrift…"}
            </p>
            {description && <p className="truncate text-xs text-[#65676B]">{description}</p>}
          </div>
          <span className="shrink-0 rounded-md bg-[#E4E6EB] px-3 py-1.5 text-[13px] font-semibold">
            Jetzt bewerben
          </span>
        </div>

        <div className="mx-3 flex items-center justify-around border-t border-[#E4E6EB] py-1 text-[#65676B]">
          {(
            [
              ["like", "Gefällt mir"],
              ["comment", "Kommentieren"],
              ["send", "Teilen"],
            ] as const
          ).map(([meaning, label]) => (
            <span key={meaning} className="flex items-center gap-1.5 py-1 text-[13px] font-medium">
              <Sign meaning={meaning} form="outline" size={16} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <GhostPost />
    </div>
  );
}

/** Die Instagram-Story: Fortschrittsbalken, Seitenkopf, „Jetzt bewerben“
 *  unten – Primärtext gibt es hier wie in der echten App nicht. */
function StorySurface({
  ad,
  adAccount,
  pageId,
  pageName,
}: {
  ad?: WizardAd;
  adAccount: string;
  pageId: string;
  pageName: string;
}) {
  const asset = ad && assetFor(ad, "portrait");
  return (
    <div className="relative h-full bg-black">
      {asset ? (
        <Media
          key={asset.kind === "video" ? asset.videoId : asset.hash}
          asset={asset}
          adAccount={adAccount}
          fit={asset.orientation === "portrait" ? "object-cover" : "object-contain"}
        />
      ) : (
        <EmptyMedia dark />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="absolute inset-x-0 top-0 space-y-2 p-3 text-white">
        <div className="h-0.5 overflow-hidden rounded-full bg-white/30">
          <div className="h-full w-1/3 rounded-full bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <Avatar pageId={pageId} pageName={pageName} className="size-8 text-sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{pageName || "Deine Seite"}</p>
            <p className="text-[11px] text-white/80">Gesponsert</p>
          </div>
          <Sign meaning="close" size={16} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1">
        <svg viewBox="0 0 24 24" className="size-4 fill-white" aria-hidden>
          <path d="m12 8-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
        </svg>
        <span className="rounded-full bg-white px-5 py-1.5 text-[13px] font-semibold text-black">
          Jetzt bewerben
        </span>
      </div>
    </div>
  );
}

/** Das Instagram-Reel: Aktionsleiste rechts, Seitenkopf und Primärtext
 *  unten links, helle CTA-Banderole darunter. */
function ReelSurface({
  ad,
  adAccount,
  pageId,
  pageName,
  body,
}: {
  ad?: WizardAd;
  adAccount: string;
  pageId: string;
  pageName: string;
  body: string;
}) {
  const asset = ad && assetFor(ad, "portrait");
  return (
    <div className="relative h-full bg-black">
      {asset ? (
        <Media
          key={asset.kind === "video" ? asset.videoId : asset.hash}
          asset={asset}
          adAccount={adAccount}
          fit={asset.orientation === "portrait" ? "object-cover" : "object-contain"}
        />
      ) : (
        <EmptyMedia dark />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent" />

      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4 text-white">
        <Sign meaning="like" form="outline" size={24} color="white" />
        <Sign meaning="comment" form="outline" size={24} color="white" />
        <Sign meaning="send" form="outline" size={24} color="white" />
        <span className="pb-1 text-lg leading-none font-bold">⋮</span>
      </div>

      <div className="absolute right-0 bottom-3 left-3 space-y-2 pr-12 text-white">
        <div className="flex items-center gap-2">
          <Avatar pageId={pageId} pageName={pageName} className="size-7 text-xs" />
          <p className="truncate text-[13px] font-semibold">{pageName || "Deine Seite"}</p>
          <p className="shrink-0 text-xs text-white/80">· Gesponsert</p>
        </div>
        {body && <p className="line-clamp-2 text-xs leading-snug whitespace-pre-wrap">{body}</p>}
        <div className="rounded-md bg-white/95 py-1.5 text-center text-[13px] font-semibold text-black">
          Jetzt bewerben
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Vorschau

/**
 * Bodies und Titles können unterschiedlich lang sein (je 1–5 Einträge) – Meta
 * kombiniert sie frei zu Anzeigen. Die Vorschau blättert deshalb über die
 * längere der beiden Listen und fällt für die kürzere auf deren ersten
 * Eintrag zurück, statt "undefined" zu zeigen.
 */
export function Preview({
  adSet,
  pageName,
  pageId,
  adAccount,
}: {
  adSet: WizardAdSet;
  pageName: string;
  /** Für das Seitenprofilbild – ohne ID zeigt der Kreis den Anfangsbuchstaben. */
  pageId: string;
  /** Für die Bild-Adresse – ohne Konto kein Bild, siehe app/api/image. */
  adAccount: string;
}) {
  const [surface, setSurface] = useState<Surface>("feed");
  const [variant, setVariant] = useState(0);
  const [adId, setAdId] = useState<string>();

  const variantCount = Math.max(adSet.bodies.length, adSet.titles.length, 1);
  const index = Math.min(variant, variantCount - 1);
  const body = adSet.bodies[index] ?? adSet.bodies[0] ?? "";
  const title = adSet.titles[index] ?? adSet.titles[0] ?? "";
  const ad = adSet.ads.find((a) => a.id === adId) ?? adSet.ads[0];

  const shared = { ad, adAccount, pageId, pageName };

  return (
    <Card elevation="low" className="h-fit">
      <div className="space-y-3">
        <TabList value={surface} onChange={(v: string) => setSurface(v as Surface)}>
          <Tab value="feed" label="Feed" />
          <Tab value="story" label="Story" />
          <Tab value="reel" label="Reel" />
        </TabList>

        {adSet.ads.length > 1 && (
          <Selector
            label="Anzeige für die Vorschau"
            isLabelHidden
            options={adSet.ads.map((a) => ({ value: a.id, label: a.name }))}
            value={ad!.id}
            onChange={setAdId}
            width="100%"
          />
        )}

        {/* Der Telefonrahmen: schwarze Blende, 9:16 wie ein echtes Display.
            Der Feed füllt die Höhe mit dem angeschnittenen nächsten Beitrag,
            Story und Reel füllen sie ohnehin. */}
        <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[2rem] border-[6px] border-black bg-black shadow-lg">
          <div className="relative aspect-[9/16] overflow-hidden">
            {surface === "feed" ? (
              <FeedSurface {...shared} body={body} title={title} description={adSet.description} />
            ) : surface === "story" ? (
              <StorySurface {...shared} />
            ) : (
              <ReelSurface {...shared} body={body} />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            isIconOnly
            icon={<Sign meaning="previous" />}
            isDisabled={index === 0}
            onClick={() => setVariant(index - 1)}
            label="Vorherige Variante"
          />
          <span className="text-ink-500 text-xs">
            Variante {index + 1} / {variantCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            isIconOnly
            icon={<Sign meaning="next" />}
            isDisabled={index === variantCount - 1}
            onClick={() => setVariant(index + 1)}
            label="Nächste Variante"
          />
        </div>
      </div>
    </Card>
  );
}
