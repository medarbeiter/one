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
import { Alert, Button, Checkbox, CheckboxGroup, Modal, ScrollShadow } from "@heroui/react";
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Überschriften generieren</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-3">
              {free === 0 ? (
                <Alert status="default">
                  <Alert.Content>
                    <Alert.Title>Alle Überschriften sind belegt</Alert.Title>
                    <Alert.Description>
                      Meta rotiert höchstens fünf. Entferne eine, um eine andere zu übernehmen.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : (
                <p className="text-ink-500 text-sm tabular-nums">
                  {selected.length} von {free} ausgewählt
                </p>
              )}

              <ScrollShadow className="max-h-[24rem] px-0.5 py-1" size={48}>
                <CheckboxGroup
                  value={selected}
                  onChange={setSelected}
                  aria-label="Vorgeschlagene Überschriften"
                  className="flex flex-col gap-2.5"
                >
                  {suggestions.map((title) => (
                    <Checkbox
                      key={title}
                      value={title}
                      // Voll heißt: das Ausgewählte bleibt anklickbar (zum
                      // Abwählen), der Rest nicht. Sonst müsste man raten,
                      // warum ein Klick nichts tut.
                      isDisabled={full && !selected.includes(title)}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        {title}
                      </Checkbox.Content>
                    </Checkbox>
                  ))}
                </CheckboxGroup>
              </ScrollShadow>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onPress={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button
                isDisabled={selected.length === 0}
                onPress={() => {
                  // In der Reihenfolge der Vorschläge, nicht der Klicks: so
                  // steht die Liste hinterher so da, wie sie im Dialog stand.
                  onApply(suggestions.filter((t) => selected.includes(t)));
                  onOpenChange(false);
                }}
              >
                Übernehmen
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
