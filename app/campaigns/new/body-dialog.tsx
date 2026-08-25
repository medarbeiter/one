"use client";

/**
 * Fünf Primärtexte per KI, statt fünfmal in ein leeres Feld zu schreiben.
 *
 * Anders als der Überschriften-Dialog (headline-dialog.tsx) erfindet dieser
 * durchaus etwas: Mistral schreibt die Vorlagen aus lib/bodies.ts auf den
 * Kunden um. Was die App nicht weiß – die Benefits des Arbeitgebers – trägt
 * die Person hier ein, bevor sie generiert. Übernehmen ersetzt alle
 * Primärtexte; nachbessern lässt sich danach in den normalen Feldern.
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
  Text,
  TextArea,
} from "@astryxdesign/core";
import { generateBodiesAction } from "../actions";

export function BodyDialog({
  isOpen,
  onOpenChange,
  business,
  roles,
  roleFreeText,
  place,
  onApply,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  business: string;
  roles: string[];
  roleFreeText?: string;
  /** Ort der Anzeigengruppe – Stadt aus Metas Verzeichnis oder die Adresse. */
  place?: string;
  onApply: (bodies: string[]) => void;
}) {
  const [benefits, setBenefits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [results, setResults] = useState<string[]>([]);

  // Benefits bleiben über Öffnen/Schließen stehen – wer nach dem Übernehmen
  // noch einmal generiert, will nicht alles neu eintippen.
  const generate = async () => {
    setLoading(true);
    setError(undefined);
    const res = await generateBodiesAction({ business, roles, roleFreeText, place, benefits });
    setError(res.error);
    if (!res.error) setResults(res.bodies);
    setLoading(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Layout
        header={<DialogHeader title="Primärtexte generieren" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-4">
              <Text type="supporting" as="p">
                Rollen und Ort kommen aus der Kampagne. Was die App nicht weiß, sind die
                Benefits des Arbeitgebers – eine pro Zeile, sie stehen wörtlich in den Texten.
              </Text>
              <TextArea
                label="Benefits"
                value={benefits}
                onChange={setBenefits}
                rows={5}
                width="100%"
                placeholder={"z. B.\nWeihnachts- & Urlaubsgeld\n30 Urlaubstage\nJobRad"}
              />
              {error && (
                <Banner
                  status="error"
                  title="Primärtexte konnten nicht generiert werden"
                  description={error}
                />
              )}
              {results.length > 0 && (
                <div className="scroll-fade max-h-[24rem] space-y-3 px-0.5 py-1">
                  {results.map((body, i) => (
                    <div key={i} className="border-line rounded-xl border p-3">
                      <p className="text-ink-500 mb-1 text-xs font-medium">Primärtext {i + 1}</p>
                      <p className="text-sm whitespace-pre-wrap">{body}</p>
                    </div>
                  ))}
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
                variant={results.length ? "secondary" : "primary"}
                label={loading ? "Wird generiert…" : results.length ? "Neu generieren" : "Generieren"}
                onClick={generate}
                isDisabled={loading}
              />
              {results.length > 0 && (
                <Button
                  label="Übernehmen"
                  isDisabled={loading}
                  onClick={() => {
                    onApply(results);
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
