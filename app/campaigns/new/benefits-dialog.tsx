"use client";

/**
 * Der eine Dialog vor jeder Generierung: nur die Benefits, denn nur die kennt
 * keine API. Generieren schließt ihn sofort – die Texte entstehen nicht hier,
 * sondern direkt in den Formularfeldern, mit Skeletten, bis jede Antwort da
 * ist (ad-set-block.tsx). Vorher stand hier eine Vorschau, in der man der
 * Generierung beim Warten zusah; das Warten gehört ins Formular, wo man
 * währenddessen weiterarbeiten kann.
 *
 * Benefits bleiben über Öffnen und Schließen stehen (Zustand im AdSetBlock,
 * geteilt mit dem Überschriften-Dialog) – wer neu generiert, tippt nicht neu.
 */

import {
  Button,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
  Text,
  TextArea,
} from "@astryxdesign/core";

export function BenefitsDialog({
  isOpen,
  onOpenChange,
  title,
  hint,
  benefits,
  onBenefitsChange,
  onGenerate,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Was gleich generiert wird und wozu die Benefits dabei dienen. */
  hint: string;
  benefits: string;
  onBenefitsChange: (benefits: string) => void;
  /** Schließt den Dialog und startet die Generierung im Formular. */
  onGenerate: () => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Layout
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-4">
              <Text type="supporting" as="p">
                {hint}
              </Text>
              <TextArea
                label="Benefits"
                value={benefits}
                onChange={onBenefitsChange}
                rows={5}
                width="100%"
                placeholder={"z. B.\nWeihnachts- & Urlaubsgeld\n30 Urlaubstage\nJobRad"}
              />
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" label="Abbrechen" onClick={() => onOpenChange(false)} />
              <Button
                label="Generieren"
                onClick={() => {
                  onOpenChange(false);
                  onGenerate();
                }}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
