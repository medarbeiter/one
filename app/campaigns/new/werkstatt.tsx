"use client";

/**
 * Die Werkstatt: die Fläche, auf der man dem Assistenten zusieht.
 *
 * Vorher: Klick auf „Vorschlag erstellen“, ein Spinner auf dem Knopf, zehn
 * Sekunden nichts, dann ein fertig ausgefüllter Schirm. Alles, was in den zehn
 * Sekunden passiert – ClickUp lesen, Mistral die Beschreibung geben, den
 * Drive-Ordner suchen, die Onboarding-Tabelle lesen –, war unsichtbar, und
 * damit auch, woher der Vorschlag seine Werte hat.
 *
 * Jetzt steht der Plan sofort da: eine Zeile je Quelle, alle zugleich, noch
 * grau. Dann arbeitet sich der Assistent durch – die laufende Marke atmet und
 * sagt, was sie tut; die fertige trägt den Haken und darunter in einem Satz,
 * was gefunden wurde, mit demselben Herkunftsetikett, das gleich am Feld
 * steht. Wie die Schrittleiste: Zustand als Form (Punkt, Haken, Strich,
 * Warnung), Farbe als Zugabe. Eine Schiene verbindet die Marken.
 *
 * Im Vorschlag spricht die Werkstatt in einem Satz statt in Zeilen
 * (Werkstattleiste): was noch läuft, was gelesen und geschrieben wurde. Das
 * Protokoll darunter ist eingeklappt – wer wissen will, woher genau, klappt
 * es auf und sieht die Quellen in zwei Gruppen: der Auftrag, der Vorschlag.
 */

import { Collapsible, Heading, Text } from "@astryxdesign/core";
import { CheckIcon, MinusIcon, SparkleIcon, WarningIcon } from "@phosphor-icons/react";
import type { BriefEvent, BriefStep, Source } from "@/lib/brief";
import type { Brief } from "@/lib/clickup";
import { report, useActivity, type Activity, type ActivityStatus } from "./activity";
import { Herkunft } from "./herkunft";

/** Die Quellen des Zusammenbaus, in der Reihenfolge, in der lib/brief.ts sie anfasst. */
export const BRIEF_STEPS: readonly BriefStep[] = ["task", "description", "drive", "onboarding", "overview"];

// Die Zeile heißt nach ihrer Quelle, kurz. Was dort getan wird, steht als
// Satz darunter, solange es läuft – und weicht dem Gefundenen, sobald es da ist.
const BRIEF_LABEL: Record<BriefStep, { label: string; doing: string; source: Source }> = {
  task: { label: "ClickUp-Aufgabe", doing: "liest Kunde, Budget, Rollen und Drive-Link…", source: "clickup" },
  description: {
    label: "Beschreibung der Aufgabe",
    doing: "Mistral sucht Standort und Formular-Hinweis…",
    source: "clickup",
  },
  drive: { label: "Kundenordner im Drive", doing: "sucht den Ordner des Kunden…", source: "onboarding" },
  onboarding: {
    label: "Onboarding-Tabelle",
    doing: "Mistral liest die Benefits aus „Besteht aktuell“…",
    source: "onboarding",
  },
  overview: { label: "Kundenübersicht in ClickUp", doing: "sucht die Adresse im Doc…", source: "clickup" },
};

/** Der Plan, bevor die erste Antwort da ist: alle Zeilen stehen, noch grau. */
export function announceBriefPlan(): void {
  for (const step of BRIEF_STEPS) report({ id: step, label: BRIEF_LABEL[step].label, status: "queued" });
}

export function reportBriefEvent(event: BriefEvent): void {
  const { label, doing, source } = BRIEF_LABEL[event.step];
  report({
    id: event.step,
    label,
    status: event.status,
    detail: event.status === "running" ? doing : event.detail,
    // Ein Etikett nur an dem, was einen Wert gebracht hat – „übersprungen“ hat keine Herkunft.
    source: event.status === "done" ? source : undefined,
  });
}

// Der Auftrag (Schirm 1) und der Vorschlag (Schirm 2) sind zwei Gruppen im
// Protokoll – zehn gleich schwere Zeilen untereinander wären eine Tabelle.
const AUFTRAG_IDS = new Set<string>([...BRIEF_STEPS, "match", "adsets"]);

/** „a, b und c“ */
const joinDe = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} und ${xs[xs.length - 1]}`;

/**
 * Die runde Marke, wie in der Schrittleiste: 28 px, Form vor Farbe. Läuft =
 * Goldwäsche mit Bronze-Haarstrich und atmendem Hof (Gold braucht eine Kante);
 * fertig = Goldfüllung mit Haken; übersprungen = Strich auf Pergament;
 * fehlgeschlagen = Warnorange, nie Gold – ein Status verkleidet sich nicht als
 * Marke.
 */
function Marke({ status, size = 7 }: { status: ActivityStatus; size?: 7 | 9 }) {
  // Ausgeschrieben, nicht interpoliert: Tailwind findet nur Klassen, die
  // wörtlich im Quelltext stehen.
  const base = `flex ${size === 9 ? "size-9" : "size-7"} shrink-0 items-center justify-center rounded-full border transition-colors`;
  const icon = size === 9 ? 18 : 14;
  if (status === "done")
    return (
      <span aria-hidden className={`${base} border-gold-500 bg-gold-500 text-ink-900`}>
        <CheckIcon size={icon} weight="bold" />
      </span>
    );
  if (status === "running")
    return (
      <span aria-hidden className={`${base} werk-puls border-gold-600 bg-gold-100`}>
        <span className={`bg-gold-600 rounded-full ${size === 9 ? "size-2.5" : "size-2"}`} />
      </span>
    );
  if (status === "failed")
    return (
      <span aria-hidden className={`${base} border-warning-700 bg-surface text-warning-700`}>
        <WarningIcon size={icon} weight="bold" />
      </span>
    );
  if (status === "skipped")
    return (
      <span aria-hidden className={`${base} border-line bg-surface-secondary text-ink-300`}>
        <MinusIcon size={icon - 1} weight="bold" />
      </span>
    );
  return (
    <span aria-hidden className={`${base} border-line-strong bg-surface-secondary`}>
      <span className="bg-line-strong size-1.5 rounded-full" />
    </span>
  );
}

const STATUS_WORD: Record<ActivityStatus, string> = {
  queued: "wartet",
  running: "läuft",
  done: "fertig",
  skipped: "übersprungen",
  failed: "nicht gelesen",
};

function Zeile({ entry, index, last }: { entry: Activity; index: number; last: boolean }) {
  const detail = entry.detail ?? (entry.status === "running" ? "läuft…" : undefined);
  return (
    // Die Zeile kommt von unten (transform only), gestaffelt über --i: der
    // Plan baut sich in einer Bewegung auf statt in einem Schlag zu stehen.
    <li className="werk-zeile grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4" style={{ "--i": index } as never}>
      <div className="flex flex-col items-center">
        <Marke status={entry.status} />
        {/* Der Verbinder trägt den Stand wie in der Schrittleiste: golden,
            was hinter einem liegt, stone, was noch kommt. */}
        {!last && (
          <span
            aria-hidden
            className={`my-1.5 w-0.5 flex-1 rounded-full transition-colors ${
              entry.status === "done" ? "bg-gold-500" : "bg-line-strong"
            }`}
          />
        )}
      </div>
      {/* 28 px Marke, 20 px Zeile: pt-1 legt die Grundlinie der Beschriftung
          auf die Mitte der Marke. Unten Luft bis zur nächsten Marke – die
          Schiene zwischen zwei Marken muss zu sehen sein, sonst ist es eine
          Liste mit Punkten. */}
      <div className={`flex min-w-0 flex-col gap-1 pt-1 ${last ? "" : "pb-6"}`}>
        <Text
          type="body"
          weight={entry.status === "running" ? "medium" : "normal"}
          as="span"
          className={entry.status === "queued" ? "text-ink-500" : "text-ink-900"}
        >
          {entry.label}
          <span className="sr-only">, {STATUS_WORD[entry.status]}</span>
        </Text>
        {detail && (
          // Rollt wie die Zahl im Kopfband an ihren Platz: der Wert wird
          // hingeschrieben, nicht eingeblendet.
          <div key={detail} className="werk-detail flex flex-wrap items-center gap-x-3 gap-y-1">
            <Text
              type="supporting"
              as="span"
              className={entry.status === "failed" ? "text-warning-700" : "text-ink-500"}
            >
              {detail}
            </Text>
            <Herkunft source={entry.source} />
          </div>
        )}
      </div>
    </li>
  );
}

function Zeilen({ entries }: { entries: Activity[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((entry, i) => (
        <Zeile key={entry.id} entry={entry} index={i} last={i === entries.length - 1} />
      ))}
    </ol>
  );
}

/**
 * Schirm 1 während des Zusammenbaus: der gewählte Auftrag als Kopf, darunter
 * die Schiene der Quellen, unten der Stand in Worten (aria-live).
 */
export function Aufbau({ task, taskId }: { task?: Brief; taskId: string }) {
  const rows = useActivity().filter((e) => AUFTRAG_IDS.has(e.id));
  const settled = rows.filter((e) => e.status !== "queued" && e.status !== "running").length;
  const done = rows.length > 0 && settled === rows.length;
  return (
    <div className="step-enter flex flex-col gap-10 p-8">
      <div className="flex flex-col gap-2">
        <Heading level={3}>{task ? task.customer || task.name : `Aufgabe ${taskId}`}</Heading>
        {task?.customer && task.name && (
          <Text type="body" color="secondary" as="p" className="max-w-prose">
            {task.name}
          </Text>
        )}
      </div>
      <Zeilen entries={rows} />
      <Text type="supporting" as="p" aria-live="polite" className="tabular-nums">
        {done
          ? "Fertig – der Vorschlag öffnet sich."
          : `${settled} von ${rows.length} Quellen gelesen. Was gefunden wird, steht gleich mit Etikett am Feld.`}
      </Text>
    </div>
  );
}

/** Was aus dem Protokoll in einem Satz zu sagen ist. */
function zusammenfassung(entries: Activity[]): string {
  const running = entries.filter((e) => e.status === "running");
  if (running.length) {
    const ready = entries.filter((e) => e.status === "done" && AUFTRAG_IDS.has(e.id));
    return (
      `${joinDe(running.map((e) => e.label))} ${running.length === 1 ? "läuft" : "laufen"} noch` +
      (ready.length ? ` — ${joinDe(ready.map((e) => e.label))} ${ready.length === 1 ? "steht" : "stehen"} schon.` : ".")
    );
  }
  const written = new Set(["texte", "titel", "beschreibung"]);
  const isWritten = (e: Activity) => written.has(e.id.split(":")[0]);
  const read = entries.filter((e) => e.status === "done" && !isWritten(e));
  const wrote = entries.filter((e) => e.status === "done" && isWritten(e));
  const failed = entries.filter((e) => e.status === "failed");
  return [
    read.length ? `Gelesen: ${joinDe(read.map((e) => e.label))}.` : undefined,
    wrote.length ? `Geschrieben: ${joinDe(wrote.map((e) => e.label))}.` : undefined,
    failed.length ? `Nicht gelesen: ${joinDe(failed.map((e) => e.label))} — bitte von Hand.` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Schirm 2: der Assistent sagt in einem Satz, was er tut oder getan hat.
 * Darunter, eingeklappt, das Protokoll in zwei Gruppen.
 */
export function Werkstattleiste() {
  const entries = useActivity();
  if (!entries.length) return null;
  const running = entries.some((e) => e.status === "running");
  const failed = entries.some((e) => e.status === "failed");
  const auftrag = entries.filter((e) => AUFTRAG_IDS.has(e.id));
  const vorschlag = entries.filter((e) => !AUFTRAG_IDS.has(e.id));
  return (
    <div className="bg-surface-secondary border-line flex flex-col gap-5 rounded-2xl border p-6">
      <div className="flex gap-5">
        {running ? (
          <Marke status="running" size={9} />
        ) : (
          // Der Funke ist das Zeichen der Generatoren (SparkleIcon an jedem
          // „generieren“-Knopf) – hier sagt er: das hat der Assistent gebaut.
          <span
            aria-hidden
            className={`bg-gold-100 flex size-9 shrink-0 items-center justify-center rounded-full border ${
              failed ? "border-warning-700 text-warning-700" : "border-gold-600 text-gold-600"
            }`}
          >
            <SparkleIcon size={18} weight="fill" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
          <Text type="large" weight="medium" as="h3">
            {running ? "Der Assistent arbeitet" : "Der Vorschlag steht"}
          </Text>
          {/* Zwei Zeilen hoch, auch wenn der Satz eine ist: der Wechsel von
              „läuft noch“ zu „Gelesen … Geschrieben …“ darf den Inhalt darunter
              nicht um eine Zeile verschieben. */}
          <Text type="body" color="secondary" as="p" className="min-h-[2lh] max-w-prose" aria-live="polite">
            {zusammenfassung(entries)}
          </Text>
        </div>
      </div>
      <Collapsible
        defaultIsOpen={false}
        className="border-line -mx-2 border-t pt-1"
        trigger={<span className="text-ink-500 text-sm">Protokoll — {entries.length} Schritte</span>}
      >
        <div className="grid gap-8 pt-4 pb-4 sm:grid-cols-2">
          {[
            ["Aus dem Auftrag", auftrag],
            ["Für den Vorschlag", vorschlag],
          ].map(([titel, rows]) =>
            (rows as Activity[]).length ? (
              <section key={titel as string} className="flex flex-col gap-4">
                <Text type="label" as="h3" className="text-ink-500">
                  {titel as string}
                </Text>
                <Zeilen entries={rows as Activity[]} />
              </section>
            ) : null,
          )}
        </div>
      </Collapsible>
    </div>
  );
}
