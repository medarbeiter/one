"use client";

import { useState } from "react";
import { Button, Card, Heading } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { imagePreviewUrl } from "@/lib/media";
import type { FormatAsset } from "@/lib/launch";
import type { WizardAdSet } from "./state";

/**
 * Ein Video bringt seine Thumbnail-URL mit; ein Bild hat nach dem Upload nur
 * einen Hash und wird über app/api/image sichtbar. Bleibt nur der Dateiname,
 * wenn beides fehlt – ein kaputtes <img> hilft niemandem.
 */
function AssetTile({
  asset,
  adAccount,
  label,
}: {
  asset: FormatAsset;
  adAccount: string;
  label?: string;
}) {
  const url =
    asset.kind === "video" ? asset.thumbnailUrl : adAccount ? imagePreviewUrl(asset.hash, adAccount) : undefined;

  return (
    <div className="min-w-0 flex-1 space-y-1">
      {url ? (
        // Meta-CDN-Host steht nicht in next.config.ts als images.remotePatterns – next/image
        // würde hier zur Laufzeit fehlschlagen, daher bewusst ein einfaches <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-40 w-full rounded-xl object-cover" />
      ) : (
        <div className="bg-canvas border-line text-ink-300 flex h-40 items-center rounded-xl border px-2 text-xs">
          <span className="w-full truncate text-center">{asset.fileName}</span>
        </div>
      )}
      {label && <p className="text-ink-500 truncate text-xs">{label}</p>}
    </div>
  );
}

/**
 * Bodies und Titles können unterschiedlich lang sein (je 1–5 Einträge) – Meta
 * kombiniert sie frei zu Anzeigen. Die Vorschau blättert deshalb über die
 * längere der beiden Listen und fällt für die kürzere auf deren ersten
 * Eintrag zurück, statt "undefined" zu zeigen.
 */
export function Preview({
  adSet,
  pageName,
  adAccount,
}: {
  adSet: WizardAdSet;
  pageName: string;
  /** Für die Bild-Adresse – ohne Konto kein Bild, siehe app/api/image. */
  adAccount: string;
}) {
  const [variant, setVariant] = useState(0);
  const variantCount = Math.max(adSet.bodies.length, adSet.titles.length, 1);
  const index = Math.min(variant, variantCount - 1);
  const body = adSet.bodies[index] ?? adSet.bodies[0] ?? "";
  const title = adSet.titles[index] ?? adSet.titles[0] ?? "";
  // Die Vorschau zeigt immer die erste Anzeige der Gruppe – die Texte darunter
  // gelten ohnehin für alle Anzeigen der Gruppe gleichermaßen.
  const ad = adSet.ads[0];

  return (
    // Astryx' Card hat keine Unterteile (Header/Content) mehr – Titel und
    // Inhalt teilen sich denselben space-y-Block.
    <Card elevation="low" className="h-fit">
      <div className="space-y-2 text-sm">
        <Heading level={3} className="text-base">
          Vorschau
        </Heading>
        <p className="text-ink-900 truncate font-medium">{pageName || "Deine Seite"}</p>

        <p
          className={`whitespace-pre-wrap ${body ? "text-ink-900" : "text-ink-300 italic"}`}
        >
          {body || "Primärtext…"}
        </p>

        {!ad ? (
          <div className="bg-canvas border-line grid h-40 place-items-center rounded-xl border text-xs text-ink-300">
            Dein Bild oder Video
          </div>
        ) : ad.type === "ugc" || ad.type === "single" ? (
          <AssetTile asset={ad.asset} adAccount={adAccount} />
        ) : (
          // Zwei Kacheln nebeneinander wie das Hochformat/Quadratisch-Paar im
          // Werbeanzeigenmanager – so muss die Aufteilung nicht erklärt werden.
          <div className="flex gap-2">
            <AssetTile asset={ad.portrait} adAccount={adAccount} label="Hochformat · Story, Reels" />
            <AssetTile asset={ad.square} adAccount={adAccount} label="Quadratisch · Feed" />
          </div>
        )}

        <p className={`font-medium ${title ? "text-ink-900" : "text-ink-300 italic"}`}>
          {title || "Überschrift…"}
        </p>

        <div className="flex items-center justify-between pt-1">
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
