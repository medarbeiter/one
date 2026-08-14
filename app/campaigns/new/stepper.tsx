"use client";

/**
 * Die Schrittleiste des Assistenten.
 *
 * Vorher standen hier HeroUI-Tabs. Zwei Gründe, warum sie weg sind:
 *
 * 1. Falsche Bedeutung. Tabs sind vier gleichrangige Sichten auf dasselbe;
 *    ein Assistent hat eine Reihenfolge, einen Fortschritt und Schritte, die
 *    noch nicht dran sind. „Schritt 2 von 4" ist keine Registerkarte.
 * 2. Ein echter Fehler. Die Pille hinter dem gewählten Reiter (`Tabs.Indicator`)
 *    liegt als `absolute size-full` in ihrem Reiter und wandert per Transform;
 *    weil jeder Reiter `z-index: 1` hat, malte die Pille des späteren Reiters
 *    über die Beschriftung des früheren. Daher „1. Ku" statt „1. Kunde".
 *
 * Der Zustand steht jetzt im Zeichen selbst statt allein in der Schriftfarbe:
 * Haken = erledigt, Zahl = offen, Schloss = noch gesperrt. Farbe ist die
 * Zugabe, nicht die Information.
 */

import { CheckIcon, LockSimpleIcon } from "@phosphor-icons/react";

export type StepperStep = {
  label: string;
  /** Offene Punkte an diesem Schritt. 0 heißt: nichts hält hier auf. */
  issues: number;
};

type StepState = "done" | "current" | "todo" | "locked";

function stateOf(index: number, current: number, locked: boolean, issues: number): StepState {
  if (locked) return "locked";
  if (index === current) return "current";
  // Erledigt ist nur, was hinter einem liegt *und* nichts offen hat – sonst
  // stünde ein Haken an einem Schritt, der die Kampagne blockiert.
  if (index < current && issues === 0) return "done";
  return "todo";
}

/** Die runde Marke links: Zahl, Haken oder Schloss. */
function Badge({ state, number }: { state: StepState; number: number }) {
  const base =
    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors";
  if (state === "done")
    return (
      <span aria-hidden className={`${base} border-gold-500 bg-gold-500 text-ink-900`}>
        <CheckIcon size={13} weight="bold" />
      </span>
    );
  if (state === "current")
    return (
      <span aria-hidden className={`${base} border-gold-500 bg-gold-500 text-ink-900`}>
        {number}
      </span>
    );
  if (state === "locked")
    return (
      <span aria-hidden className={`${base} border-line text-ink-300`}>
        <LockSimpleIcon size={12} weight="bold" />
      </span>
    );
  return (
    <span aria-hidden className={`${base} border-ink-300 bg-surface text-ink-500`}>
      {number}
    </span>
  );
}

export function Stepper({
  steps,
  current,
  onSelect,
  /** Ab hier ist noch nichts auszufüllen – ohne Kunde trägt kein Schritt etwas. */
  lockedFrom = steps.length,
}: {
  steps: StepperStep[];
  current: number;
  onSelect: (index: number) => void;
  lockedFrom?: number;
}) {
  return (
    <nav aria-label="Schritte" className="border-line border-b px-2 sm:px-4">
      <ol className="flex items-stretch">
        {steps.map((step, i) => {
          const locked = i >= lockedFrom;
          const state = stateOf(i, current, locked, step.issues);
          const showsIssues = step.issues > 0 && !locked;
          return (
            <li key={step.label} className="relative min-w-0 flex-1">
              <button
                type="button"
                disabled={locked}
                aria-current={state === "current" ? "step" : undefined}
                aria-label={
                  `Schritt ${i + 1} von ${steps.length}: ${step.label}` +
                  (locked
                    ? ", noch gesperrt"
                    : showsIssues
                      ? step.issues === 1
                        ? ", 1 offener Punkt"
                        : `, ${step.issues} offene Punkte`
                      : i < current
                        ? ", erledigt"
                        : "")
                }
                onClick={() => onSelect(i)}
                className={[
                  // 2px Fokusring statt des HeroUI-Standards am Reiter: der Knopf
                  // hat keinen eigenen Rand, an dem Fokus sonst sichtbar würde.
                  "flex w-full items-center justify-center gap-2 rounded-t-lg px-2 py-3 outline-none",
                  "focus-visible:ring-focus focus-visible:ring-2 focus-visible:ring-inset",
                  locked ? "cursor-not-allowed" : "hover:bg-surface-secondary cursor-pointer",
                ].join(" ")}
              >
                <Badge state={state} number={i + 1} />
                <span
                  aria-hidden
                  className={[
                    "hidden truncate text-[0.8125rem] sm:block",
                    state === "current"
                      ? "text-ink-900 font-semibold"
                      : state === "locked"
                        ? "text-ink-300 font-medium"
                        : "text-ink-500 font-medium",
                  ].join(" ")}
                >
                  {step.label}
                </span>
                {showsIssues && (
                  <span
                    aria-hidden
                    className="bg-attention text-danger-700 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums"
                  >
                    {step.issues}
                  </span>
                )}
              </button>
              {/* Der Balken sitzt am Schritt und nicht als wandernde Pille über
                  allen – er kann damit nichts überdecken. */}
              <span
                aria-hidden
                className={[
                  "absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors",
                  state === "current" ? "bg-gold-500" : "bg-transparent",
                ].join(" ")}
              />
            </li>
          );
        })}
      </ol>
      {/* Schmal bleibt von der Leiste nur die Zahlenreihe – der Name des
          aktuellen Schritts steht dann darunter statt gar nicht. */}
      <p className="text-ink-700 px-2 pb-2 text-[0.8125rem] font-semibold sm:hidden">
        Schritt {current + 1} von {steps.length}: {steps[current]?.label}
      </p>
    </nav>
  );
}
