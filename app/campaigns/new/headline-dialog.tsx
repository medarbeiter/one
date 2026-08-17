"use client";

/**
 * Zwanzig Überschriften zur Auswahl, statt fünfmal in ein leeres Feld zu sehen.
 *
 * Der Dialog erfindet nichts: die Zeilen kommen aus lib/headlines.ts, also aus
 * Vorlagen, die Rolle und Kundenname einsetzen. Ausgewählt wird höchstens so
 * viel, wie noch Platz hat – Meta rotiert fünf Überschriften, und ein Dialog,
 * der zehn annimmt und fünf davon verschluckt, wäre schlimmer als keiner.
 */

import { useEffect, useState } from "react";
import {
  Banner,
  Button,
  CheckboxList,
  CheckboxListItem,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core";
import { generateHeadlines } from "@/lib/headlines";

export function HeadlineDialog({
  isOpen,
  onOpenChange,
  business,
  roles,
  roleFreeText,
  taken,
  free,
  onApply,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  business: string;
  roles: string[];
  roleFreeText?: string;
  /** Was schon in der Liste steht – wird nicht noch einmal angeboten. */
  taken: string[];
  /** Wie viele Überschriften noch Platz haben. */
  free: number;
  onApply: (titles: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  // Jedes Öffnen fängt bei null an: die Auswahl des letzten Mals steht ja schon
  // in der Liste und wäre hier nur ein Vorschlag, den man schon angenommen hat.
  useEffect(() => {
    if (isOpen) setSelected([]);
  }, [isOpen]);

  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  const suggestions = generateHeadlines({ business, roles, roleFreeText }).filter(
    (t) => !used.has(t.toLowerCase()),
  );
  const full = selected.length >= free;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Layout
        header={<DialogHeader title="Überschriften generieren" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-3">
              {free === 0 ? (
                <Banner
                  status="info"
                  title="Alle Überschriften sind belegt"
                  description="Meta rotiert höchstens fünf. Entferne eine, um eine andere zu übernehmen."
                />
              ) : (
                <p className="text-ink-500 text-sm tabular-nums">
                  {selected.length} von {free} ausgewählt
                </p>
              )}

              {/* .scroll-fade ersetzt HeroUIs ScrollShadow (app/globals.css). */}
              <div className="scroll-fade max-h-[24rem] px-0.5 py-1">
                <CheckboxList
                  label="Vorgeschlagene Überschriften"
                  isLabelHidden
                  value={selected}
                  onChange={setSelected}
                >
                  {suggestions.map((title) => (
                    <CheckboxListItem
                      key={title}
                      label={title}
                      value={title}
                      // Voll heißt: das Ausgewählte bleibt anklickbar (zum
                      // Abwählen), der Rest nicht. Sonst müsste man raten,
                      // warum ein Klick nichts tut.
                      isDisabled={full && !selected.includes(title)}
                    />
                  ))}
                </CheckboxList>
              </div>
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" label="Abbrechen" onClick={() => onOpenChange(false)} />
              <Button
                label="Übernehmen"
                isDisabled={selected.length === 0}
                onClick={() => {
                  // In der Reihenfolge der Vorschläge, nicht der Klicks: so
                  // steht die Liste hinterher so da, wie sie im Dialog stand.
                  onApply(suggestions.filter((t) => selected.includes(t)));
                  onOpenChange(false);
                }}
              />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
