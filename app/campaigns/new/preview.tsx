"use client";

import { useCallback, useMemo, useState } from "react";
import { Button, Card, Selector } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import type { PreviewFormat } from "@/lib/campaigns";
import type { CreativeInput } from "@/lib/launch";
import { Vorschauen } from "../vorschauen";
import { wizardPreviewAction } from "../actions";
import { toAdInput, type WizardAdSet } from "./state";

/**
 * Die Vorschau kommt von Meta selbst: derselbe Creative-Spec, den das Anlegen
 * später schickt, geht an generatepreviews, und Meta rendert die Anzeige so,
 * wie sie in Feed, Story und Reels stehen wird – mit echter Seite, echtem
 * Profilbild, echtem Zuschnitt. Das nachgebaute Telefon, das hier stand,
 * war eine Vermutung darüber; dies ist die Sache selbst.
 */
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
  const [variant, setVariant] = useState(0);
  const [adId, setAdId] = useState<string>();

  const variantCount = Math.max(adSet.bodies.length, adSet.titles.length, 1);
  const index = Math.min(variant, variantCount - 1);
  const ad = adSet.ads.find((a) => a.id === adId) ?? adSet.ads[0];

  // Eine Variante je Vorschau: Meta zeigt sonst immer die erste. Der Spec ist
  // zugleich der Schlüssel – gleicher Spec, gleiche Fassung, kein Aufruf.
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
  const schluessel = input ? JSON.stringify(input) : "";
  const lade = useCallback(
    (format: PreviewFormat) => wizardPreviewAction(adAccount, input!, format),
    [adAccount, input],
  );

  return (
    <Card elevation="low" className="h-fit">
      <div className="space-y-3">
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

        {!ad ? (
          <p className="text-ink-500 py-10 text-center text-sm">Lade ein Motiv hoch – dann zeigt Meta hier die Anzeige.</p>
        ) : !pageId ? (
          <p className="text-ink-500 py-10 text-center text-sm">Wähle zuerst den Kunden – die Vorschau braucht seine Seite.</p>
        ) : (
          // Getippt wird in Schüben: eine gute halbe Sekunde nach dem letzten Anschlag.
          <Vorschauen lade={lade} schluessel={schluessel} ruheMs={600} />
        )}

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
