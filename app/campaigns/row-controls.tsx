"use client";

import { useState, useTransition } from "react";
import { AlertDialog, Button, NumberInput, Switch, useToast } from "@astryxdesign/core";
import { setBudgetAction, setStatusAction } from "./actions";

export function StatusSwitch({ id, name, status }: { id: string; name: string; status: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
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
        // Aktivieren gibt Geld aus – nur das wird nachgefragt, Pausieren nicht.
        onChange={(on) => (on ? setConfirming(true) : apply("PAUSED"))}
      />

      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title="Live schalten?"
        description={`„${name}“ gibt ab sofort sein Tagesbudget aus.`}
        cancelLabel="Abbrechen"
        actionLabel="Live schalten"
        // Kein Löschen, sondern ein Ausgaben-Start – die destructive-Vorbelegung
        // des AlertDialogs passt hier nicht.
        actionVariant="primary"
        onAction={() => {
          setConfirming(false);
          apply("ACTIVE");
        }}
      />
    </>
  );
}

export function BudgetField({ id, cents }: { id: string; cents?: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  // Ohne daily_budget (z. B. Lifetime-Budget) gibt es nichts zu editieren –
  // ein leeres Feld mit 0 vorzubelegen würde ein Tagesbudget vortäuschen,
  // das die Kampagne nie hatte.
  const [value, setValue] = useState((cents ?? 0) / 100);

  if (cents === undefined) return <span className="text-ink-500 text-xs">—</span>;

  return (
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
      onBlur={() => {
        if (!Number.isFinite(value) || Math.round(value * 100) === cents) return;
        start(async () => {
          const r = await setBudgetAction(id, value);
          if (r.error) toast({ body: `Budget konnte nicht gespeichert werden: ${r.error}`, type: "error" });
        });
      }}
      className="w-32"
    />
  );
}
