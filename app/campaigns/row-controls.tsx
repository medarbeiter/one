"use client";

import { useState, useTransition } from "react";
import { AlertDialog, Button, NumberField, Switch, toast } from "@heroui/react";
import { setBudgetAction, setStatusAction } from "./actions";

export function StatusSwitch({ id, name, status }: { id: string; name: string; status: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const live = status === "ACTIVE";

  const apply = (next: "ACTIVE" | "PAUSED") =>
    start(async () => {
      const r = await setStatusAction(id, next);
      if (r.error) toast.danger(`Status konnte nicht geändert werden: ${r.error}`);
    });

  return (
    <>
      <Switch
        isSelected={live}
        isDisabled={pending || status === "ARCHIVED"}
        aria-label={`Status of ${name}`}
        // Aktivieren gibt Geld aus – nur das wird nachgefragt, Pausieren nicht.
        onChange={(on) => (on ? setConfirming(true) : apply("PAUSED"))}
      >
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>{live ? "Aktiv" : "Pausiert"}</Switch.Content>
      </Switch>

      {/* Kein "Content"-Teil bei AlertDialog: der Aufbau ist Backdrop > Container > Dialog. */}
      <AlertDialog isOpen={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>Live schalten?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                &bdquo;{name}&ldquo; gibt ab sofort sein Tagesbudget aus.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" onPress={() => setConfirming(false)}>
                  Abbrechen
                </Button>
                <Button
                  onPress={() => {
                    setConfirming(false);
                    apply("ACTIVE");
                  }}
                >
                  Live schalten
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

export function BudgetField({ id, cents }: { id: string; cents?: number }) {
  const [pending, start] = useTransition();
  // Ohne daily_budget (z. B. Lifetime-Budget) gibt es nichts zu editieren –
  // ein leeres Feld mit 0 vorzubelegen würde ein Tagesbudget vortäuschen,
  // das die Kampagne nie hatte.
  const [value, setValue] = useState((cents ?? 0) / 100);

  if (cents === undefined) return <span className="text-ink-500 text-xs">—</span>;

  return (
    <NumberField
      aria-label="Tagesbudget"
      value={value}
      onChange={setValue}
      minValue={1}
      // Cent-genau wie im Assistenten: step={1} rastete beim Verlassen auf
      // ganze Euro ein und verwarf die Eingabe stillschweigend.
      step={0.01}
      formatOptions={{
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }}
      isDisabled={pending}
      // Erst beim Verlassen des Feldes schreiben – nicht bei jedem Tastendruck.
      // value kommt bereits geparst von NumberField, kein Parsen des
      // formatierten Strings (Tausendertrennzeichen, Locale) nötig.
      onBlur={() => {
        if (!Number.isFinite(value) || Math.round(value * 100) === cents) return;
        start(async () => {
          const r = await setBudgetAction(id, value);
          if (r.error) toast.danger(`Budget konnte nicht gespeichert werden: ${r.error}`);
        });
      }}
      className="w-32"
    >
      <NumberField.Group>
        <NumberField.Input />
      </NumberField.Group>
    </NumberField>
  );
}
