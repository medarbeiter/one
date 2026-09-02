"use client";

/**
 * Die Schrittleiste des Assistenten.
 *
 * Kein `TabList`: Tabs sind vier gleichrangige Sichten auf dasselbe; ein
 * Assistent hat eine Reihenfolge, einen Fortschritt und Schritte, die noch
 * nicht dran sind. Astryx sagt dasselbe in den Best Practices seines TabList
 * („Don't use tabs for sequential steps or workflows") – es gibt keine
 * Stepper-Komponente, also steht sie hier.
 *
 * Der Zustand steht im Zeichen selbst statt allein in der Schriftfarbe:
 * Haken = erledigt, Zahl = offen, Schloss = noch gesperrt. Farbe ist die
 * Zugabe, nicht die Information.
 *
 * Die Leiste ist eine **Schiene, keine Reihe von vier Feldern**. Vorher trug
 * jeder Schritt `flex-1`: auf 1180 px Karte standen vier Beschriftungen von je
 * 90 px in vier 290-px-Feldern, mit 200 px Nichts dazwischen – vier lose Wörter
 * statt eines Wegs. Jetzt umschließt jeder Schritt seinen Inhalt, und den Raum
 * dazwischen füllt der Verbinder: golden hinter sich gebracht, stone noch vor
 * sich. Derselbe Platz, aber er trägt jetzt die Auskunft, die vorher nur in der
 * Farbe der Marke stand.
 */

import { Fragment } from "react";
import { CheckIcon, LockSimpleIcon } from "@phosphor-icons/react";

export type StepperStep = {
  label: string;
  /** Offene Punkte an diesem Schritt. 0 heißt: nichts hält hier auf. */
  issues: number;
};

type StepState = "done" | "current" | "todo" | "locked" | "building";

function stateOf(
  index: number,
  current: number,
  locked: boolean,
  issues: number,
  building: boolean,
): StepState {
  // Der Schritt, der gerade gebaut wird, ist noch gesperrt – aber nicht still:
  // die Marke atmet, solange der Vorschlag entsteht.
  if (building) return "building";
  if (locked) return "locked";
  if (index === current) return "current";
  // Erledigt ist nur, was hinter einem liegt *und* nichts offen hat – sonst
  // stünde ein Haken an einem Schritt, der die Kampagne blockiert.
  if (index < current && issues === 0) return "done";
  return "todo";
}

/**
 * Die runde Marke: Zahl, Haken oder Schloss.
 *
 * 28 px statt 24 – bei 24 verschwand der Haarstrich der offenen Schritte gegen
 * die weiße Karte, und übrig blieb eine nackte Ziffer. Die offenen Marken
 * tragen deshalb jetzt auch die Pergamentfläche und den kräftigen Rand: eine
 * Marke, die noch nicht dran ist, ist trotzdem eine Marke.
 */
function Mark({ state, number }: { state: StepState; number: number }) {
  const base =
    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors";
  if (state === "done")
    return (
      <span aria-hidden className={`${base} border-gold-500 bg-gold-500 text-ink-900`}>
        <CheckIcon size={14} weight="bold" />
      </span>
    );
  if (state === "current")
    return (
      // Der Hof aus Goldwasch ist die einzige Stelle, an der die Leiste mehr
      // trägt als eine Farbe: er hebt den laufenden Schritt auch dann heraus,
      // wenn die Beschriftungen unter `sm` gar nicht dastehen.
      <span
        aria-hidden
        className={`${base} border-gold-500 bg-gold-500 text-ink-900 ring-gold-100 ring-4`}
      >
        {number}
      </span>
    );
  if (state === "locked")
    return (
      <span aria-hidden className={`${base} border-line bg-surface-secondary text-ink-300`}>
        <LockSimpleIcon size={13} weight="bold" />
      </span>
    );
  if (state === "building")
    return (
      // Goldwäsche mit Bronze-Haarstrich (Gold braucht eine Kante), der Hof
      // pulst: dieselbe Marke wie „laufend“, nur noch nicht betreten.
      <span aria-hidden className={`${base} werk-puls border-gold-600 bg-gold-100 text-gold-700`}>
        {number}
      </span>
    );
  return (
    <span aria-hidden className={`${base} border-line-strong bg-surface-secondary text-ink-500`}>
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
  /** Der Schritt, dessen Inhalt gerade zusammengesetzt wird (der Vorschlag beim Lesen des Auftrags). */
  building,
}: {
  steps: StepperStep[];
  current: number;
  onSelect: (index: number) => void;
  lockedFrom?: number;
  building?: number;
}) {
  return (
    // px-4 + der Innenabstand des Knopfs (px-2) ergeben die 24 px, mit denen
    // auch der Schrittinhalt darunter von der Kartenkante wegsteht: die erste
    // Marke fluchtet mit der Überschrift. Oben pt-6 plus die py-3 des Knopfs:
    // 36 px zwischen Kartenkante und Marke. Mehr als unten, mit Absicht – die
    // Leiste ist der Kopf der Karte, und ein Kopf, der oben so eng steht wie
    // unten, sieht aus, als sei er hineingerutscht.
    //
    // Kein `border-b` mehr: die Leiste braucht keinen Strich, um oben zu sein,
    // und der Haarstrich unter der Frage im Schritt darunter (`Step`) stand
    // 24 px später noch einmal fast dasselbe. Zwei Linien in 40 px machen aus
    // einem Kopf eine Tabelle.
    <nav aria-label="Schritte" className="px-4 pt-6 pb-1">
      <ol className="flex items-stretch">
        {steps.map((step, i) => {
          const locked = i >= lockedFrom;
          const state = stateOf(i, current, locked, step.issues, building === i);
          const showsIssues = step.issues > 0 && !locked;
          return (
            <Fragment key={step.label}>
              <li className="min-w-0">
                <button
                  type="button"
                  disabled={locked}
                  aria-current={state === "current" ? "step" : undefined}
                  aria-label={
                    `Schritt ${i + 1} von ${steps.length}: ${step.label}` +
                    (state === "building"
                      ? ", wird gerade zusammengesetzt"
                      : locked
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
                    // 2px Fokusring statt des Astryx-Standards: der Knopf hat
                    // keinen eigenen Rand, an dem Fokus sonst sichtbar würde.
                    "flex items-center gap-2.5 rounded-lg px-2 py-3 outline-none",
                    // `transition-colors` gehört an den Knopf, nicht nur an die
                    // Marke darin: die Fläche darunter tönt beim Überfahren mit,
                    // und ohne Übergang springt sie, während die Marke gleitet.
                    "transition-colors",
                    "focus-visible:ring-focus focus-visible:ring-2 focus-visible:ring-inset",
                    locked ? "cursor-not-allowed" : "hover:bg-surface-secondary cursor-pointer",
                  ].join(" ")}
                >
                  <Mark state={state} number={i + 1} />
                  <span
                    aria-hidden
                    className={[
                      "hidden truncate text-sm sm:block",
                      state === "current"
                        ? "text-ink-900 font-semibold"
                        : state === "locked"
                          ? "text-ink-300 font-medium"
                          : state === "building"
                            ? "text-gold-700 font-medium"
                            : "text-ink-500 font-medium",
                    ].join(" ")}
                  >
                    {step.label}
                  </span>
                  {showsIssues && (
                    <span
                      aria-hidden
                      className="bg-attention text-danger-700 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                    >
                      {step.issues}
                    </span>
                  )}
                </button>
              </li>

              {/* Der Verbinder trägt den Fortschritt: hinter dem laufenden
                  Schritt golden, davor stone. Er ist keine Station, deshalb
                  aria-hidden – die Reihenfolge steht schon in „Schritt 2 von 4"
                  an jedem Knopf. min-w-4 hält ihn sichtbar, wenn die
                  Beschriftungen auf schmalen Schirmen die ganze Breite wollen. */}
              {i < steps.length - 1 && (
                <li aria-hidden className="flex min-w-4 flex-1 items-center px-1 sm:px-2">
                  <span
                    className={`h-0.5 w-full rounded-full transition-colors ${
                      i < current ? "bg-gold-500" : "bg-line-strong"
                    }`}
                  />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
      {/* Schmal bleibt von der Leiste nur die Zahlenreihe – der Name des
          aktuellen Schritts steht dann darunter statt gar nicht. */}
      <p className="text-ink-700 px-2 pb-3 text-sm font-semibold sm:hidden">
        Schritt {current + 1} von {steps.length}: {steps[current]?.label}
      </p>
    </nav>
  );
}
