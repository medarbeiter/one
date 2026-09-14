"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Selector, Skeleton, Tab, TabList, Text } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { PREVIEW_FORMATS, type PreviewFormat } from "@/lib/campaigns";
import type { CreativeInput } from "@/lib/launch";
import { wizardPreviewAction } from "../actions";
import { toAdInput, type WizardAdSet } from "./state";

/**
 * Die Vorschau kommt von Meta selbst: derselbe Creative-Spec, den das Anlegen
 * später schickt, geht an generatepreviews, und Meta rendert die Anzeige so,
 * wie sie in Feed, Story und Reels stehen wird – mit echter Seite, echtem
 * Profilbild, echtem Zuschnitt. Das nachgebaute Telefon, das hier stand,
 * war eine Vermutung darüber; dies ist die Sache selbst.
 *
 * Getippt wird in Schüben: die Anfrage wartet eine gute halbe Sekunde nach
 * dem letzten Anschlag, und jede fertige Fassung bleibt im Speicher – wer
 * zwischen Feed und Story wechselt, wartet nicht zweimal.
 */
const RUHE_MS = 600;

export function Preview({
  adSet,
  pageId,
  instagramUserId,
  adAccount,
}: {
  adSet: WizardAdSet;
  pageId: string;
  instagramUserId?: string;
  adAccount: string;
}) {
  const [format, setFormat] = useState<PreviewFormat>("INSTAGRAM_STANDARD");
  const [variant, setVariant] = useState(0);
  const [adId, setAdId] = useState<string>();
  const [html, setHtml] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);

  const variantCount = Math.max(adSet.bodies.length, adSet.titles.length, 1);
  const index = Math.min(variant, variantCount - 1);
  const ad = adSet.ads.find((a) => a.id === adId) ?? adSet.ads[0];

  // Eine Variante je Vorschau: Meta zeigt sonst immer die erste. Der Spec
  // ist zugleich der Schlüssel – gleicher Spec, gleiche Fassung, kein Aufruf.
  const input = useMemo<CreativeInput | undefined>(() => {
    if (!ad || !pageId) return undefined;
    return {
      pageId,
      instagramUserId,
      formId: adSet.formId,
      bodies: [adSet.bodies[index] ?? adSet.bodies[0] ?? ""],
      titles: [adSet.titles[index] ?? adSet.titles[0] ?? ""],
      description: adSet.description,
      ad: toAdInput(ad),
    };
  }, [ad, pageId, instagramUserId, adSet.formId, adSet.bodies, adSet.titles, adSet.description, index]);
  const key = input ? `${format}:${JSON.stringify(input)}` : "";

  useEffect(() => {
    if (!input || html[key]) return;
    let aktuell = true;
    setLaedt(true);
    setFehler(undefined);
    const uhr = setTimeout(async () => {
      const r = await wizardPreviewAction(adAccount, input, format);
      if (!aktuell) return;
      if (r.html) setHtml((h) => ({ ...h, [key]: r.html! }));
      else setFehler(r.error);
      setLaedt(false);
    }, RUHE_MS);
    return () => {
      aktuell = false;
      clearTimeout(uhr);
    };
  }, [input, key, format, adAccount, html]);

  return (
    <Card elevation="low" className="h-fit">
      <div className="space-y-3">
        <TabList value={format} onChange={(v: string) => setFormat(v as PreviewFormat)}>
          {PREVIEW_FORMATS.map(([wert, text]) => (
            <Tab key={wert} value={wert} label={text} />
          ))}
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

        <div className="vorschau flex min-h-[520px] items-start justify-center" aria-busy={laedt}>
          {!ad ? (
            <Text type="supporting" size="sm" color="secondary">
              Lade ein Motiv hoch – dann zeigt Meta hier die Anzeige.
            </Text>
          ) : !pageId ? (
            <Text type="supporting" size="sm" color="secondary">
              Wähle zuerst den Kunden – die Vorschau braucht seine Seite.
            </Text>
          ) : fehler ? (
            <span className="text-sm" style={{ color: "var(--color-error)" }}>{fehler}</span>
          ) : html[key] ? (
            <div dangerouslySetInnerHTML={{ __html: html[key] }} />
          ) : (
            <Skeleton className="h-[520px] w-[320px] rounded-lg" />
          )}
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
