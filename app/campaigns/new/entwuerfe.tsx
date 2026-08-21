"use client";

import { Button, Card, Divider, Heading, List, ListItem, Section, Text } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { draftLabel, draftSummary, type Draft } from "./state";

/**
 * Datum und Uhrzeit, kurz. Ohne die Uhrzeit stünde an drei Entwürfen desselben
 * Vormittags dreimal dasselbe, und genau dann muss man sie auseinanderhalten.
 */
const gespeichert = (savedAt: number) =>
  new Date(savedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

/**
 * Die liegengebliebenen Entwürfe, zur Auswahl vor dem ersten Schritt.
 *
 * Sie steht über dem Assistenten und nicht davor: ein Auswahlschirm, durch den
 * jeder Neuanfang erst hindurchmuss, wäre bei einem meist leeren Regal vier von
 * fünf Malen im Weg. Wer die Liste übergeht und einfach tippt, beginnt einen
 * neuen Entwurf – die alten bleiben, bis sie jemand fortsetzt oder wegwirft.
 */
export function Entwuerfe({
  drafts,
  onResume,
  onRemove,
}: {
  drafts: Draft[];
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!drafts.length) return null;

  return (
    <Card elevation="low" padding={0}>
      <Section padding={6} paddingBlock={4}>
        <div className="flex flex-col gap-1">
          <Heading level={2}>
            {drafts.length === 1 ? "Ein früherer Entwurf" : `${drafts.length} frühere Entwürfe`}
          </Heading>
          <Text type="supporting" color="secondary" as="p" className="max-w-prose">
            Automatisch gespeichert, auch über einen Neustart hinweg. Fortsetzen legt den Entwurf in
            diesen Tab — oder unten einfach neu beginnen.
          </Text>
        </div>
      </Section>
      <Divider />
      <List hasDividers density="spacious">
        {drafts.map((draft) => (
          <ListItem
            key={draft.id}
            label={draftLabel(draft)}
            description={`${draftSummary(draft)} · ${gespeichert(draft.savedAt)}`}
            endContent={
              // Zwei Knöpfe statt eines klickbaren Eintrags: „Löschen“ säße
              // sonst in einer Fläche, die selbst fortsetzt, und ein Fehlgriff
              // wäre ein verlorener Entwurf.
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  label="Fortsetzen"
                  onClick={() => onResume(draft.id)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  label={`Entwurf „${draftLabel(draft)}“ löschen`}
                  icon={<Sign meaning="remove" />}
                  onClick={() => onRemove(draft.id)}
                />
              </div>
            }
          />
        ))}
      </List>
    </Card>
  );
}
