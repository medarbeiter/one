"use client";

import { useState } from "react";
import { Button, Card } from "@heroui/react";
import type { AdSetInput } from "@/lib/launch";

/**
 * Bodies und Titles können unterschiedlich lang sein (je 1–5 Einträge) – Meta
 * kombiniert sie frei zu Anzeigen. Die Vorschau blättert deshalb über die
 * längere der beiden Listen und fällt für die kürzere auf deren ersten
 * Eintrag zurück, statt "undefined" zu zeigen.
 */
export function Preview({ adSet, pageName }: { adSet: AdSetInput; pageName: string }) {
  const [variant, setVariant] = useState(0);
  const variantCount = Math.max(adSet.bodies.length, adSet.titles.length, 1);
  const index = Math.min(variant, variantCount - 1);
  const body = adSet.bodies[index] ?? adSet.bodies[0] ?? "";
  const title = adSet.titles[index] ?? adSet.titles[0] ?? "";
  const thumbnail = adSet.videos[0]?.thumbnailUrl;

  return (
    <Card className="h-fit">
      <Card.Header>
        <Card.Title className="text-base">Preview</Card.Title>
      </Card.Header>
      <Card.Content className="space-y-2 text-sm">
        <p className="text-ink-900 truncate font-medium">{pageName || "Your Page"}</p>

        <p
          className={`whitespace-pre-wrap ${body ? "text-ink-900" : "text-ink-300 italic"}`}
        >
          {body || "Primary text…"}
        </p>

        {thumbnail ? (
          // Meta-CDN-Host steht nicht in next.config.ts als images.remotePatterns – next/image
          // würde hier zur Laufzeit fehlschlagen, daher bewusst ein einfaches <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-40 w-full rounded-md object-cover" />
        ) : (
          <div className="bg-canvas border-line grid h-40 place-items-center rounded-md border text-xs text-ink-300">
            Your image or video
          </div>
        )}

        <p className={`font-medium ${title ? "text-ink-900" : "text-ink-300 italic"}`}>
          {title || "Headline…"}
        </p>

        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            isIconOnly
            isDisabled={index === 0}
            onPress={() => setVariant(index - 1)}
            aria-label="Previous variant"
          >
            ‹
          </Button>
          <span className="text-ink-500 text-xs">
            Variant {index + 1} / {variantCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            isIconOnly
            isDisabled={index === variantCount - 1}
            onPress={() => setVariant(index + 1)}
            aria-label="Next variant"
          >
            ›
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
