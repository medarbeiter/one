"use client";

/**
 * Die Beschreibung per KI: im Kern die Benefits, sauber als ✅-Liste
 * formatiert – eine je Zeile, wie in den laufenden Anzeigen. Die Benefits
 * teilen sich alle drei Generator-Dialoge (Zustand liegt im AdSetBlock);
 * wer sie schon für die Primärtexte eingetragen hat, tippt hier nichts mehr.
 */

import { useState } from "react";
import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
  Skeleton,
  Text,
  TextArea,
} from "@astryxdesign/core";
import { generateDescriptionAction } from "../actions";

export function DescriptionDialog({
  isOpen,
  onOpenChange,
  business,
  roles,
  roleFreeText,
  place,
  benefits,
  onBenefitsChange,
  onApply,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  business: string;
  roles: string[];
  roleFreeText?: string;
  place?: string;
  benefits: string;
  onBenefitsChange: (benefits: string) => void;
  onApply: (description: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<string>();

  const generate = async () => {
    setLoading(true);
    setError(undefined);
    setResult(undefined);
    const res = await generateDescriptionAction({ business, roles, roleFreeText, place, benefits });
    setError(res.error);
    setResult(res.description);
    setLoading(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Layout
        header={<DialogHeader title="Beschreibung generieren" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-4">
              <Text type="supporting" as="p">
                Die Beschreibung ist im Kern die Benefit-Liste – eine pro Zeile eintragen, sie
                werden als ✅-Zeilen formatiert. Schon für die Primärtexte eingetragene Benefits
                stehen hier bereits drin.
              </Text>
              <TextArea
                label="Benefits"
                value={benefits}
                onChange={onBenefitsChange}
                rows={5}
                width="100%"
                placeholder={"z. B.\nWeihnachts- & Urlaubsgeld\n30 Urlaubstage\nJobRad"}
              />
              {error && (
                <Banner
                  status="error"
                  title="Beschreibung konnte nicht generiert werden"
                  description={error}
                />
              )}
              {loading && (
                <div className="border-line space-y-2 rounded-xl border p-3" aria-label="Wird generiert…">
                  <Skeleton className="h-4 w-2/5 rounded" />
                  <Skeleton className="h-4 w-3/5 rounded" />
                  <Skeleton className="h-4 w-1/2 rounded" />
                </div>
              )}
              {result && (
                <div className="border-line rounded-xl border p-3">
                  <p className="text-sm whitespace-pre-wrap">{result}</p>
                </div>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" label="Abbrechen" onClick={() => onOpenChange(false)} />
              <Button
                variant={result ? "secondary" : "primary"}
                label={loading ? "Wird generiert…" : result ? "Neu generieren" : "Generieren"}
                onClick={generate}
                isDisabled={loading}
              />
              {result && (
                <Button
                  label="Übernehmen"
                  onClick={() => {
                    onApply(result);
                    onOpenChange(false);
                  }}
                />
              )}
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
