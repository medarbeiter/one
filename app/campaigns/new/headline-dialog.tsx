"use client";

/**
 * Überschriften zur Auswahl, statt fünfmal in ein leeres Feld zu sehen.
 *
 * Zwei Quellen, ein Ankreuzmuster: die Vorlagenzeilen aus lib/headlines.ts
 * stehen sofort da, und obendrüber trudeln KI-Vorschläge ein (Mistral,
 * lib/bodies.ts) – auf die Kampagne geschrieben, mit Ort und stärkstem
 * Benefit, und bewusst kurz: bei fünf gesuchten Rollen zählt der Prompt
 * nicht alle auf, Metas Kürzung bei 40 Zeichen überlebt das nie.
 * Ausgewählt wird höchstens so viel, wie noch Platz hat – Meta rotiert fünf
 * Überschriften, und ein Dialog, der zehn annimmt und fünf davon
 * verschluckt, wäre schlimmer als keiner.
 */

import { useEffect, useRef, useState } from "react";
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
  Skeleton,
} from "@astryxdesign/core";
import { generateHeadlines } from "@/lib/headlines";
import { generateTitlesAction } from "../actions";

export function HeadlineDialog({
  isOpen,
  onOpenChange,
  business,
  roles,
  roleFreeText,
  place,
  benefits,
  taken,
  free,
  onApply,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  business: string;
  roles: string[];
  roleFreeText?: string;
  /** Ort der Anzeigengruppe – für „Pflegefachkraft in Greiz“-Zeilen. */
  place?: string;
  /** Benefits aus dem Primärtext-Dialog – der stärkste taugt als Aufmacher. */
  benefits: string;
  /** Was schon in der Liste steht – wird nicht noch einmal angeboten. */
  taken: string[];
  /** Wie viele Überschriften noch Platz haben. */
  free: number;
  onApply: (titles: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [ai, setAi] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>();
  // Ein Schließen mitten im Laden: die Antwort des alten Laufs darf eine
  // später frisch geöffnete Liste nicht überschreiben.
  const run = useRef(0);

  // Jedes Öffnen fängt bei null an: die Auswahl des letzten Mals steht ja schon
  // in der Liste – und die KI-Vorschläge werden neu geholt, denn Rollen, Ort
  // oder Benefits können sich seither geändert haben.
  useEffect(() => {
    if (!isOpen) return;
    setSelected([]);
    setAi([]);
    setAiError(undefined);
    setAiLoading(true);
    const myRun = ++run.current;
    generateTitlesAction({ business, roles, roleFreeText, place, benefits }).then((res) => {
      if (run.current !== myRun) return;
      setAi(res.titles);
      setAiError(res.error);
      setAiLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  // KI zuerst – sie kennt die Kampagne, die Vorlagen sind der sichere Rest.
  // Dedupe über beide Quellen, sonst steht „Pflegefachkraft (m/w/d) gesucht“
  // doppelt da, sobald die KI dieselbe Idee hat.
  const suggestions: string[] = [];
  for (const t of [...ai, ...generateHeadlines({ business, roles, roleFreeText })]) {
    if (used.has(t.toLowerCase()) || suggestions.some((s) => s.toLowerCase() === t.toLowerCase()))
      continue;
    suggestions.push(t);
  }
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

              {/* Die KI-Zeilen kommen oben dazu, sobald sie da sind – die
                  Skelette stehen an genau der Stelle und in Zeilenhöhe der
                  Checkboxen, damit nichts springt. */}
              {aiLoading && (
                <div className="space-y-2 px-0.5" aria-label="KI-Vorschläge werden geladen…">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-6 w-3/4 rounded" />
                  ))}
                </div>
              )}
              {aiError && (
                <Banner
                  status="warning"
                  title="KI-Vorschläge kommen gerade nicht"
                  description={`${aiError} – die Vorlagen unten gehen trotzdem.`}
                />
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
