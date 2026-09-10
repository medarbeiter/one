"use client";

import { CheckIcon, LockSimpleIcon } from "@phosphor-icons/react";
import form from "./campaign-form.module.css";

export type StepperStep = { label: string; issues: number };
type StepState = "done" | "current" | "todo" | "locked" | "building";

function stateOf(
  index: number,
  current: number,
  locked: boolean,
  issues: number,
  building: boolean,
): StepState {
  // Der Aufbauzustand bleibt auch am gesperrten Schritt sichtbar.
  if (building) return "building";
  if (locked) return "locked";
  if (index === current) return "current";
  // Erledigt ist nur, was hinter einem liegt *und* nichts offen hat – sonst
  // stünde ein Haken an einem Schritt, der die Kampagne blockiert.
  if (index < current && issues === 0) return "done";
  return "todo";
}


/** Ordered campaign workflow; completed steps remain available for corrections. */
export function Stepper({ steps, current, onSelect, lockedFrom = steps.length, building }: {
  steps: StepperStep[];
  current: number;
  onSelect: (index: number) => void;
  lockedFrom?: number;
  building?: number;
}) {
  return <nav className={form.steps} aria-label="Schritte der Kampagne">
    <ol>
      {steps.map((step, i) => {
        const locked = i >= lockedFrom;
        const state = stateOf(i, current, locked, step.issues, building === i);
        const status = state === "building" ? "Wird vorbereitet…" : locked ? "Noch gesperrt" : step.issues > 0 ? `${step.issues} ${step.issues === 1 ? "Punkt offen" : "Punkte offen"}` : state === "done" ? "Abgeschlossen" : ["Aufgabe & Kunde wählen", "Inhalte & Angaben bearbeiten", "Prüfen & übertragen"][i];
        return <li key={step.label}>
          <button type="button" className={form.stepButton} data-state={state} disabled={locked} aria-current={state === "current" ? "step" : undefined} aria-label={`Schritt ${i + 1} von ${steps.length}: ${step.label}, ${status}`} onClick={() => onSelect(i)}>
            <span className={form.stepMark} aria-hidden>{state === "done" ? <CheckIcon size={18} weight="bold" /> : state === "locked" ? <LockSimpleIcon size={16} /> : i + 1}</span>
            <span className={form.stepText} aria-hidden><strong>{step.label}</strong><span data-issues={!locked && step.issues > 0}>{status}</span></span>
          </button>
        </li>;
      })}
    </ol>
  </nav>;
}
