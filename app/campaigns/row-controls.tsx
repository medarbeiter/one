"use client";

import { useState, useTransition } from "react";
import { AlertDialog, Button, NumberInput, Switch, useToast } from "@astryxdesign/core";
import { setBudgetAction, setStatusAction } from "./actions";

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function StatusSwitch({ id, name, status }: { id: string; name: string; status: string }) {
  const [pending, start] = useTransition();
  // Welche Richtung nachgefragt wird – null heißt: kein Dialog offen.
  const [confirming, setConfirming] = useState<"ACTIVE" | "PAUSED" | null>(null);
  const toast = useToast();
  const live = status === "ACTIVE";

  const apply = (next: "ACTIVE" | "PAUSED") =>
    start(async () => {
      const r = await setStatusAction(id, next);
      if (r.error) toast({ body: `Status konnte nicht geändert werden: ${r.error}`, type: "error" });
    });

  return (
    <>
      {/* label ist der sichtbare Text ("Aktiv"/"Pausiert"), aria-label
          überschreibt den zugänglichen Namen wie zuvor bei HeroUI. */}
      <Switch
        value={live}
        isDisabled={pending || status === "ARCHIVED"}
        label={live ? "Aktiv" : "Pausiert"}
        aria-label={`Status of ${name}`}
        // Beide Richtungen werden nachgefragt: Aktivieren gibt Geld aus,
        // Pausieren stoppt die Bewerbungen eines Kunden – ein Fehlklick in der
        // Liste darf keines von beiden auslösen.
        onChange={(on) => setConfirming(on ? "ACTIVE" : "PAUSED")}
      />

      <AlertDialog
        isOpen={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming === "PAUSED" ? "Pausieren?" : "Live schalten?"}
        description={
          confirming === "PAUSED"
            ? `„${name}“ liefert ab sofort keine Anzeigen und keine Leads mehr aus.`
            : `„${name}“ gibt ab sofort sein Tagesbudget aus.`
        }
        cancelLabel="Abbrechen"
        actionLabel={confirming === "PAUSED" ? "Pausieren" : "Live schalten"}
        // Kein Löschen, sondern ein Ausgaben-Start – die destructive-Vorbelegung
        // des AlertDialogs passt hier nicht.
        actionVariant="primary"
        onAction={() => {
          const next = confirming;
          setConfirming(null);
          if (next) apply(next);
        }}
      />
    </>
  );
}

export function BudgetField({ id, name, cents }: { id: string; name: string; cents?: number }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  // Ohne daily_budget (z. B. Lifetime-Budget) gibt es nichts zu editieren –
  // ein leeres Feld mit 0 vorzubelegen würde ein Tagesbudget vortäuschen,
  // das die Kampagne nie hatte.
  const [value, setValue] = useState((cents ?? 0) / 100);

  if (cents === undefined) return <span className="text-ink-500 text-xs">—</span>;

  // Der Dialog fragt nach, der Blur schreibt nichts mehr selbst: ein
  // verrutschtes Komma wäre sonst ein zehnfaches Budget ohne Rückfrage.
  const geaendert = Number.isFinite(value) && Math.round(value * 100) !== cents;

  return (
    <>
    <NumberInput
      label="Tagesbudget"
      // Wie zuvor kein sichtbares Label, nur ein zugänglicher Name.
      isLabelHidden
      value={value}
      onChange={setValue}
      min={1}
      // Cent-genau wie im Assistenten: step={1} rastete beim Verlassen auf
      // ganze Euro ein und verwarf die Eingabe stillschweigend.
      step={0.01}
      // Astryx NumberInput kennt keine formatOptions (Währungsformatierung mit
      // Tausendertrennzeichen) – units zeigt wenigstens das Symbol an.
      units="€"
      isDisabled={pending}
      // Erst beim Verlassen des Feldes schreiben – nicht bei jedem Tastendruck.
      // value kommt bereits geparst von NumberInput, kein Parsen des
      // formatierten Strings (Tausendertrennzeichen, Locale) nötig.
      onBlur={() => geaendert && setConfirming(true)}
      className="w-32"
    />
    <AlertDialog
      isOpen={confirming}
      onOpenChange={(open) => {
        setConfirming(open);
        // Abgebrochen: das Feld zeigt wieder, was Meta hat.
        if (!open) setValue(cents / 100);
      }}
      title="Tagesbudget ändern?"
      description={`„${name}“: ${EUR.format(cents / 100)} → ${EUR.format(value)} pro Tag.`}
      cancelLabel="Abbrechen"
      actionLabel="Budget ändern"
      actionVariant="primary"
      onAction={() => {
        setConfirming(false);
        start(async () => {
          const r = await setBudgetAction(id, value);
          if (r.error) {
            setValue(cents / 100);
            toast({ body: `Budget konnte nicht gespeichert werden: ${r.error}`, type: "error" });
          }
        });
      }}
    />
    </>
  );
}
