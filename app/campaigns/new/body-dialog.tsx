"use client";

/**
 * Fünf Primärtexte per KI, statt fünfmal in ein leeres Feld zu schreiben.
 *
 * Anders als der Überschriften-Dialog (headline-dialog.tsx) erfindet dieser
 * durchaus etwas: Mistral schreibt die Vorlagen aus lib/bodies.ts auf den
 * Kunden um – ein Aufruf je Vorlage, parallel. Jeder Slot zeigt ein Skelett
 * und füllt sich, sobald seine Antwort da ist; niemand wartet auf den
 * langsamsten Text, um die ersten zu lesen. Was die App nicht weiß – die
 * Benefits des Arbeitgebers – trägt die Person vorher ein. Übernehmen ersetzt
 * alle Primärtexte; nachbessern lässt sich danach in den normalen Feldern.
 */

import { useRef, useState } from "react";
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
import { BODY_TEMPLATE_COUNT } from "@/lib/bodies";
import { generateBodyAction } from "../actions";

/** Ein Slot: leer heißt „läuft noch“, sonst Text oder Fehler. */
type Slot = { body?: string; error?: string };

export function BodyDialog({
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
  /** Ort der Anzeigengruppe – Stadt aus Metas Verzeichnis oder die Adresse. */
  place?: string;
  /** Geteilt mit Überschriften- und Beschreibungs-Dialog (AdSetBlock). */
  benefits: string;
  onBenefitsChange: (benefits: string) => void;
  onApply: (bodies: string[]) => void;
}) {
  // null: noch nie generiert – erst dann erscheinen die Slots.
  const [slots, setSlots] = useState<Slot[] | null>(null);
  // „Neu generieren“ mitten im Lauf: Antworten des alten Laufs dürfen die
  // frischen Skelette nicht füllen.
  const run = useRef(0);

  const generate = async () => {
    const myRun = ++run.current;
    setSlots(Array.from({ length: BODY_TEMPLATE_COUNT }, () => ({})));
    const input = { business, roles, roleFreeText, place, benefits };
    await Promise.all(
      Array.from({ length: BODY_TEMPLATE_COUNT }, async (_, i) => {
        const res = await generateBodyAction(input, i);
        if (run.current !== myRun) return;
        setSlots((s) => s && s.map((slot, j) => (j === i ? res : slot)));
      }),
    );
  };

  const loading = slots?.some((s) => !s.body && !s.error) ?? false;
  const texts = slots?.flatMap((s) => (s.body ? [s.body] : [])) ?? [];

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
                onChange={onBenefitsChange}
                rows={5}
                width="100%"
                placeholder={"z. B.\nWeihnachts- & Urlaubsgeld\n30 Urlaubstage\nJobRad"}
              />
              {slots && (
                <div className="scroll-fade max-h-[24rem] space-y-3 px-0.5 py-1">
                  {slots.map((slot, i) => (
                    <div key={i} className="border-line rounded-xl border p-3">
                      <p className="text-ink-500 mb-1 text-xs font-medium">Primärtext {i + 1}</p>
                      {slot.body ? (
                        <p className="text-sm whitespace-pre-wrap">{slot.body}</p>
                      ) : slot.error ? (
                        <Banner
                          status="error"
                          title="Dieser Text konnte nicht generiert werden"
                          description={slot.error}
                        />
                      ) : (
                        // Drei Zeilen Skelett statt eines Blocks: sieht aus wie
                        // der Text, der gleich hier steht.
                        <div className="space-y-2" aria-label="Wird generiert…">
                          <Skeleton className="h-4 w-full rounded" />
                          <Skeleton className="h-4 w-5/6 rounded" />
                          <Skeleton className="h-4 w-2/3 rounded" />
                        </div>
                      )}
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
                variant={slots ? "secondary" : "primary"}
                label={loading ? "Wird generiert…" : slots ? "Neu generieren" : "Generieren"}
                onClick={generate}
                isDisabled={loading}
              />
              {slots && (
                <Button
                  // Übernehmen schon, sobald die ersten Texte stehen – wer die
                  // langsamen nicht abwarten will, muss nicht. Ersetzt werden
                  // nur so viele Primärtexte, wie Texte da sind.
                  label={loading && texts.length > 0 ? `${texts.length} übernehmen` : "Übernehmen"}
                  isDisabled={texts.length === 0}
                  onClick={() => {
                    onApply(texts);
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
