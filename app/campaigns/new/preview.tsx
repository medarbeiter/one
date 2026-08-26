"use client";

import { useState } from "react";
import { Button, Card, Selector, Tab, TabList } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { imagePreviewUrl } from "@/lib/media";
import type { WizardAd, WizardAdSet, WizardAsset } from "./state";

/**
 * Die Vorschau als Telefon: Facebook- und Instagram-Feed, Story und Reel so
 * gebaut, wie die Apps sie zeigen – mit Statusleiste, „Gesponsert“, CTA und
 * abspielbaren Videos. Die Farben sind absichtlich Metas eigene und keine
 * Theme-Tokens: nachgeahmt wird eine fremde Oberfläche, die sich nicht nach
 * unserem Theme richten darf, sonst sieht sie nach uns aus statt nach Meta.
 *
 * Formate werden respektiert: die quadratische Hälfte läuft im Feed als 1:1,
 * ein 9:16-Video dort als 4:5-Beschnitt (wie bei Meta); in Story und Reel
 * füllt Hochformat das Display, Quadratisches bekommt schwarze Balken.
 */

type Surface = "feed" | "story" | "reel";
type Platform = "facebook" | "instagram";

/** Welche Hälfte einer Anzeige auf welcher Fläche läuft. */
function assetFor(ad: WizardAd, want: "portrait" | "square"): WizardAsset {
  if (ad.type === "split") return want === "portrait" ? ad.portrait : ad.square;
  return ad.asset;
}

/** 1:1 bleibt 1:1; Hochformat zeigt der Feed als 4:5-Beschnitt. */
const feedAspect = (asset?: WizardAsset) =>
  asset?.orientation === "portrait" ? "aspect-[4/5]" : "aspect-square";

/** Hochformat füllt das Display, Quadratisches bekommt schwarze Balken. */
const fullscreenFit = (asset: WizardAsset) =>
  asset.orientation === "portrait" ? "object-cover" : "object-contain";

// ------------------------------------------------------------------- Glyphen

/** Die App-Symbole, die unser Icon-Satz bewusst nicht kennt – hier als rohe
 *  Pfade, denn sie gehören zur nachgeahmten Oberfläche, nicht zu uns. */
const GLYPHS = {
  heart: "M12 21C7 16.7 3 13.2 3 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 3.5c0 3.7-4 7.2-9 11.5z",
  comment: "M12 3a9 9 0 1 0 4.4 16.9L21 21l-1.1-4.6A9 9 0 0 0 12 3z",
  plane: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  bookmark: "M6 3h12v18l-6-4.5L6 21z",
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5",
  plus: "M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM12 8v8M8 12h8",
  reel: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 8.5h18M8 4l2.5 4.5M14 4l2.5 4.5",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  camera:
    "M4 8a2 2 0 0 1 2-2h1l2-2h6l2 2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  chevronRight: "m9 5 7 7-7 7",
  chevronUp: "m5 15 7-7 7 7",
  chevronLeft: "m15 5-7 7 7 7",
  thumb: "M7 11v10M7 11l3.8-7a2 2 0 0 1 2.2 2v3.5h5.4a2 2 0 0 1 2 2.4L19 19.5a2 2 0 0 1-2 1.5H7",
  share: "M14 5.5 21 12l-7 6.5V14c-5.5 0-9 2-11 5.5C4 12.5 8 9.8 14 9.5z",
  x: "M6 6l12 12M18 6 6 18",
} as const;

function G({
  d,
  size = 22,
  className,
  strokeWidth = 1.7,
}: {
  d: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

// -------------------------------------------------------------- Telefonchrom

/** Uhrzeit, Empfang, Akku – als Fläche im Fluss (Feeds) oder als Overlay
 *  über dem Medium (Story, Reel). */
function StatusBar({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-9 shrink-0 items-end justify-between px-6 pb-1 text-[12px] font-semibold ${className}`}>
      <span>9:41</span>
      <span className="flex items-center gap-1">
        {/* Empfangsbalken, WLAN, Akku – reine Staffage. */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden>
          <rect x="0" y="7" width="3" height="4" rx="0.75" />
          <rect x="4.5" y="5" width="3" height="6" rx="0.75" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.75" />
          <rect x="13" y="0" width="3" height="11" rx="0.75" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M2 6a15 15 0 0 1 20 0M5.5 9.8a10 10 0 0 1 13 0M9 13.5a5 5 0 0 1 6 0M12 17h.01" />
        </svg>
        <svg width="22" height="11" viewBox="0 0 25 12" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" opacity="0.5" />
          <rect x="2" y="2" width="15" height="8" rx="1.5" fill="currentColor" />
          <path d="M23.5 4v4a2 2 0 0 0 0-4z" fill="currentColor" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
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
function Media({ asset, adAccount, fit }: { asset: WizardAsset; adAccount: string; fit: string }) {
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

/** Kein Medium gewählt – die Fläche sagt, was hierher gehört. */
function EmptyMedia({ light }: { light?: boolean }) {
  return (
    <div
      className={`grid h-full w-full place-items-center text-xs ${
        light ? "bg-[#F0F2F5] text-[#65676B]" : "bg-neutral-900 text-white/50"
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

type SurfaceProps = {
  ad?: WizardAd;
  adAccount: string;
  pageId: string;
  pageName: string;
  body: string;
  title: string;
  description: string;
};

// ------------------------------------------------------------- Facebook-Feed

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

function FacebookFeed({ ad, adAccount, pageId, pageName, body, title, description }: SurfaceProps) {
  const [expanded, setExpanded] = useState(false);
  const asset = ad && assetFor(ad, "square");
  const clamp = !expanded && body.length > 180;

  return (
    <div className="flex h-full flex-col bg-[#F0F2F5] text-[#050505]">
      <StatusBar className="bg-white" />
      <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:none]">
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
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
              <button type="button" onClick={() => setExpanded(true)} className="font-semibold text-[#65676B]">
                Weiterlesen
              </button>
            )}
          </div>

          <div className={`${feedAspect(asset)} bg-black`}>
            {asset ? (
              <Media
                key={asset.kind === "video" ? asset.videoId : asset.hash}
                asset={asset}
                adAccount={adAccount}
                fit="object-cover"
              />
            ) : (
              <EmptyMedia light />
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

          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-[#65676B]">
            <span className="flex items-center gap-1">
              <span className="grid size-4 place-items-center rounded-full bg-[#1877F2] text-white">
                <G d={GLYPHS.thumb} size={9} strokeWidth={2.4} />
              </span>
              47
            </span>
            <span>3 Kommentare · 2 Mal geteilt</span>
          </div>

          <div className="mx-3 flex items-center justify-around border-t border-[#E4E6EB] py-1 text-[#65676B]">
            {(
              [
                [GLYPHS.thumb, "Gefällt mir"],
                [GLYPHS.comment, "Kommentieren"],
                [GLYPHS.share, "Teilen"],
              ] as const
            ).map(([d, label]) => (
              <span key={label} className="flex items-center gap-1.5 py-1 text-[13px] font-medium">
                <G d={d} size={16} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <GhostPost />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Instagram-Feed

function InstagramFeed({ ad, adAccount, pageId, pageName, body }: SurfaceProps) {
  const asset = ad && assetFor(ad, "square");

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <StatusBar />
      <div className="flex shrink-0 items-center justify-between px-4 py-1.5">
        <G d={GLYPHS.camera} size={24} />
        <span className="font-serif text-xl font-semibold italic">Instagram</span>
        <G d={GLYPHS.plane} size={22} />
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:none]">
        <div className="flex items-center gap-2 px-3 py-2">
          <Avatar pageId={pageId} pageName={pageName} className="size-8 text-sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{pageName || "Deine Seite"}</p>
            <p className="text-[11px] text-[#A8A8A8]">Gesponsert</p>
          </div>
          <span className="text-lg leading-none tracking-widest">…</span>
        </div>

        <div className={`${feedAspect(asset)} bg-neutral-900`}>
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

        <div className="flex items-center justify-between bg-[#0095F6] px-3 py-2.5 text-[13px] font-semibold">
          Jetzt bewerben
          <G d={GLYPHS.chevronRight} size={14} strokeWidth={2.2} />
        </div>

        <div className="flex items-center gap-4 px-3 pt-2.5">
          <G d={GLYPHS.heart} size={24} />
          <G d={GLYPHS.comment} size={24} />
          <G d={GLYPHS.plane} size={24} />
          <G d={GLYPHS.bookmark} size={24} className="ml-auto" />
        </div>

        <div className="space-y-1 px-3 py-2 text-[13px] leading-snug">
          <p className="font-semibold">Gefällt 312 Mal</p>
          <p className={`line-clamp-2 whitespace-pre-wrap ${body ? "" : "text-[#A8A8A8] italic"}`}>
            <span className="font-semibold">{pageName || "Deine Seite"}</span> {body || "Primärtext…"}
          </p>
          <p className="text-[#A8A8A8]">Alle 3 Kommentare ansehen</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-around border-t border-white/15 px-2 pt-2 pb-4">
        {[GLYPHS.home, GLYPHS.search, GLYPHS.plus, GLYPHS.reel, GLYPHS.profile].map((d, i) => (
          <G key={i} d={d} size={23} />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- Story

/** Story-Chrom ist auf Facebook und Instagram praktisch gleich – eine Fläche
 *  für beide Plattformen. */
function Story({ ad, adAccount, pageId, pageName }: SurfaceProps) {
  const asset = ad && assetFor(ad, "portrait");
  return (
    <div className="relative h-full bg-black text-white">
      <div className="absolute inset-x-0 top-9 bottom-14 overflow-hidden rounded-xl bg-neutral-950">
        {asset ? (
          <Media
            key={asset.kind === "video" ? asset.videoId : asset.hash}
            asset={asset}
            adAccount={adAccount}
            fit={fullscreenFit(asset)}
          />
        ) : (
          <EmptyMedia />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />

        <div className="absolute inset-x-0 top-0 space-y-2 p-3">
          <div className="h-0.5 overflow-hidden rounded-full bg-white/30">
            <div className="h-full w-1/3 rounded-full bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <Avatar pageId={pageId} pageName={pageName} className="size-8 text-sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold">{pageName || "Deine Seite"}</p>
              <p className="text-[11px] text-white/80">Gesponsert</p>
            </div>
            <span className="text-lg leading-none tracking-widest">…</span>
            <G d={GLYPHS.x} size={18} strokeWidth={2.2} />
          </div>
        </div>
      </div>

      <StatusBar className="relative z-10" />
      <div className="absolute inset-x-0 bottom-3 flex items-end justify-center gap-3 px-4">
        <div className="flex flex-col items-center gap-0.5">
          <G d={GLYPHS.chevronUp} size={14} strokeWidth={2.2} />
          <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black">
            <G d={GLYPHS.link} size={14} strokeWidth={2} />
            Jetzt bewerben
          </span>
        </div>
        <G d={GLYPHS.plane} size={22} className="absolute right-4 bottom-2" />
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- Reels

function InstagramReel({ ad, adAccount, pageId, pageName, body }: SurfaceProps) {
  const asset = ad && assetFor(ad, "portrait");
  return (
    <div className="relative flex h-full flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        {asset ? (
          <Media
            key={asset.kind === "video" ? asset.videoId : asset.hash}
            asset={asset}
            adAccount={adAccount}
            fit={fullscreenFit(asset)}
          />
        ) : (
          <EmptyMedia />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent" />

        <div className="absolute inset-x-0 top-0">
          <StatusBar />
          <div className="flex items-center justify-between px-4 pt-1">
            <span className="text-lg font-bold">Reels</span>
            <G d={GLYPHS.camera} size={24} />
          </div>
        </div>

        <div className="absolute right-2 bottom-3 flex flex-col items-center gap-3.5">
          {(
            [
              [GLYPHS.heart, "1.204"],
              [GLYPHS.comment, "36"],
              [GLYPHS.plane, ""],
            ] as const
          ).map(([d, count]) => (
            <span key={d} className="flex flex-col items-center gap-0.5">
              <G d={d} size={24} />
              {count && <span className="text-[11px] font-semibold">{count}</span>}
            </span>
          ))}
          <span className="pb-1 text-lg leading-none font-bold">⋮</span>
        </div>

        <div className="absolute bottom-3 left-3 space-y-2 pr-14">
          <div className="flex items-center gap-2">
            <Avatar pageId={pageId} pageName={pageName} className="size-7 text-xs" />
            <p className="truncate text-[13px] font-semibold">{pageName || "Deine Seite"}</p>
            <p className="shrink-0 text-xs text-white/80">· Gesponsert</p>
          </div>
          {body && <p className="line-clamp-2 text-xs leading-snug whitespace-pre-wrap">{body}</p>}
          <div className="flex items-center justify-between rounded-md bg-neutral-800/90 px-3 py-2 text-[13px] font-semibold">
            Jetzt bewerben
            <G d={GLYPHS.chevronRight} size={14} strokeWidth={2.2} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-around border-t border-white/15 px-2 pt-2 pb-4">
        {[GLYPHS.home, GLYPHS.search, GLYPHS.plus, GLYPHS.reel, GLYPHS.profile].map((d, i) => (
          <G key={i} d={d} size={23} />
        ))}
      </div>
    </div>
  );
}

function FacebookReel({ ad, adAccount, pageId, pageName, body }: SurfaceProps) {
  const asset = ad && assetFor(ad, "portrait");
  return (
    <div className="relative h-full bg-black text-white">
      {asset ? (
        <Media
          key={asset.kind === "video" ? asset.videoId : asset.hash}
          asset={asset}
          adAccount={adAccount}
          fit={fullscreenFit(asset)}
        />
      ) : (
        <EmptyMedia />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />

      <div className="absolute inset-x-0 top-0">
        <StatusBar />
        <div className="flex items-center justify-between px-4 pt-1">
          <span className="flex items-center gap-2 text-lg font-bold">
            <G d={GLYPHS.chevronLeft} size={18} strokeWidth={2.2} />
            Reels
          </span>
          <G d={GLYPHS.camera} size={24} />
        </div>
      </div>

      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-3.5">
        {(
          [
            [GLYPHS.thumb, "1,2 Tsd."],
            [GLYPHS.comment, "89"],
            [GLYPHS.share, ""],
          ] as const
        ).map(([d, count]) => (
          <span key={d} className="flex flex-col items-center gap-0.5">
            <G d={d} size={24} />
            {count && <span className="text-[11px] font-semibold">{count}</span>}
          </span>
        ))}
      </div>

      <div className="absolute inset-x-3 bottom-4 space-y-2">
        <div className="flex items-center gap-2 pr-12">
          <Avatar pageId={pageId} pageName={pageName} className="size-7 text-xs" />
          <p className="truncate text-[13px] font-semibold">{pageName || "Deine Seite"}</p>
          <p className="shrink-0 text-xs text-white/80">· Gesponsert</p>
        </div>
        {body && <p className="line-clamp-2 pr-12 text-xs leading-snug whitespace-pre-wrap">{body}</p>}
        <div className="flex items-center gap-2">
          <span className="flex-1 rounded-full bg-white py-1.5 text-center text-[13px] font-semibold text-black">
            Jetzt bewerben
          </span>
          <span className="text-lg leading-none tracking-widest">…</span>
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
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [variant, setVariant] = useState(0);
  const [adId, setAdId] = useState<string>();

  const variantCount = Math.max(adSet.bodies.length, adSet.titles.length, 1);
  const index = Math.min(variant, variantCount - 1);
  const body = adSet.bodies[index] ?? adSet.bodies[0] ?? "";
  const title = adSet.titles[index] ?? adSet.titles[0] ?? "";
  const ad = adSet.ads.find((a) => a.id === adId) ?? adSet.ads[0];

  const props: SurfaceProps = {
    ad,
    adAccount,
    pageId,
    pageName,
    body,
    title,
    description: adSet.description,
  };

  const Fläche =
    surface === "story"
      ? Story
      : surface === "feed"
        ? platform === "facebook"
          ? FacebookFeed
          : InstagramFeed
        : platform === "facebook"
          ? FacebookReel
          : InstagramReel;

  return (
    <Card elevation="low" className="h-fit">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabList value={surface} onChange={(v: string) => setSurface(v as Surface)}>
            <Tab value="feed" label="Feed" />
            <Tab value="story" label="Story" />
            <Tab value="reel" label="Reel" />
          </TabList>
          {/* Story-Chrom ist auf beiden Plattformen gleich – der Schalter
              hätte dort nichts zu ändern und verschwindet. */}
          {surface !== "story" && (
            <div className="border-line flex overflow-hidden rounded-lg border text-xs font-medium">
              {(["instagram", "facebook"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  aria-pressed={platform === p}
                  className={`px-2.5 py-1.5 ${platform === p ? "bg-surface-secondary text-ink-900" : "text-ink-500"}`}
                >
                  {p === "instagram" ? "Instagram" : "Facebook"}
                </button>
              ))}
            </div>
          )}
        </div>

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

        {/* Ein Telefon für alle Flächen: iPhone-Proportion, Notch, Balken. */}
        <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[2.5rem] border-[6px] border-black bg-black shadow-lg">
          <div className="relative aspect-[9/19] overflow-hidden">
            <Fläche {...props} />
            <div className="pointer-events-none absolute top-1.5 left-1/2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
            <div
              className={`pointer-events-none absolute bottom-1 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full ${
                surface === "feed" && platform === "facebook" ? "bg-black/80" : "bg-white/90"
              }`}
            />
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
