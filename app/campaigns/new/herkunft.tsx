"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Badge, HoverCard, Link, Text } from "@astryxdesign/core";
import type { Beleg, Quellenlage, Source } from "@/lib/brief";

export const HERKUNFT_LABEL: Record<Source, string> = {
  clickup: "aus ClickUp",
  onboarding: "aus der Onboarding-Tabelle",
  previous: "aus der letzten Kampagne",
  session: "aus der Anmeldung",
  user: "aus deinem Hinweis",
  campaign: "aus der Vorlage",
  hand: "von Hand geändert",
};

// Kurzformen fürs Verbinden: „aus ClickUp + Onboarding“ liest sich, „aus
// ClickUp + aus der Onboarding-Tabelle“ nicht.
const KURZ: Record<Source, string> = {
  clickup: "ClickUp",
  onboarding: "Onboarding",
  previous: "der letzten Kampagne",
  session: "der Anmeldung",
  user: "deinem Hinweis",
  campaign: "der Vorlage",
  hand: "Hand",
};

/** Die Art der Quelle, wie sie im Tooltip vorne steht – das System, nicht der Satz. */
const ART: Record<Source, string> = {
  clickup: "ClickUp",
  onboarding: "Google Sheets",
  previous: "Meta",
  session: "Anmeldung",
  user: "Hinweis",
  campaign: "Meta",
  hand: "Von Hand",
};

/** Eine Quelle wie bisher, mehrere in gegebener Reihenfolge mit „+“ verbunden. */
export function herkunftLabel(source?: Source | Source[]): string | undefined {
  const sources = source === undefined ? [] : Array.isArray(source) ? source : [source];
  if (!sources.length) return undefined;
  return sources.length === 1 ? HERKUNFT_LABEL[sources[0]] : `aus ${sources.map((s) => KURZ[s]).join(" + ")}`;
}

/**
 * Die Belege, aufgeteilt in die, aus denen der Wert stammt, und die, die nur
 * mitgelesen wurden. Beide sollen sichtbar sein: dass die Aufgabe Renningen
 * sagt und die Kundenübersicht Stuttgart, ist die Information.
 */
export function splitBelege(used: Source[], belege: Beleg[]): { genutzt: Beleg[]; weitere: Beleg[] } {
  const genutzt = belege.filter((b) => used.includes(b.source));
  return { genutzt, weitere: belege.filter((b) => !genutzt.includes(b)) };
}

/**
 * Was der Zusammenbau lesen konnte. Steht einmal am Assistenten, nicht an
 * jedem Feld: die Felder ohne Herkunft lesen daraus, warum sie leer sind.
 * Fehlt (manueller Start ohne Aufgabe), sagt kein Feld etwas – da wurde
 * nichts gelesen, also fehlt auch nichts.
 */
const QuellenContext = createContext<Quellenlage | undefined>(undefined);
export const QuellenProvider = QuellenContext.Provider;

/**
 * Woher ein vorbelegter Wert stammt. Ein Etikett, kein Satz: es steht an
 * jedem gefüllten Feld, und wer es liest, soll den Wert prüfen, nicht die
 * Herkunft studieren. Der Tooltip trägt die Belege – Stelle, Wortlaut, Link.
 *
 * `fehlt` sagt, was gilt, wenn es keine Herkunft gibt („Hausstandard 17 €“) –
 * dann steht ein stilles Etikett „ohne Quelle“ am Feld, und der Tooltip nennt
 * den Grund samt Quellenlage. Ohne `fehlt` (Werkstatt-Zeilen) bleibt es leer.
 */
export function Herkunft({
  source,
  belege = [],
  fehlt,
}: {
  source?: Source | Source[];
  belege?: Beleg[];
  fehlt?: string;
}) {
  const quellen = useContext(QuellenContext);
  const sources = source === undefined ? [] : Array.isArray(source) ? source : [source];
  const label = herkunftLabel(sources);

  if (!label) {
    if (!fehlt || !quellen) return null;
    return (
      <Karte label="Ohne Quelle" content={<Grund fehlt={fehlt} quellen={quellen} belege={belege} />}>
        <Badge variant="neutral" label="ohne Quelle" className="text-xs opacity-70" />
      </Karte>
    );
  }

  const { genutzt, weitere } = splitBelege(sources, belege);
  const byHand = sources.includes("hand");
  return (
    <Karte
      label={label}
      content={
        <div className="space-y-3">
          {byHand && (
            <div>
              <Text type="supporting" as="span">
                Du hast den Wert geändert – was die Quellen sagten, steht darunter.
              </Text>
            </div>
          )}
          {genutzt.length > 0 && <Belege belege={genutzt} />}
          {weitere.length > 0 && (
            <div className="space-y-2">
              <div>
                <Text type="supporting" as="span" className="text-ink-500">
                  {genutzt.length || byHand ? "Auch gelesen, nicht übernommen" : "Gelesen"}
                </Text>
              </div>
              <Belege belege={weitere} />
            </div>
          )}
          {!genutzt.length && !weitere.length && (
            <div>
              <Text type="supporting" as="span">
                {byHand ? "Vorher stand hier nichts aus einer Quelle." : "Kein Wortlaut überliefert – nur die Quelle."}
              </Text>
            </div>
          )}
        </div>
      }
    >
      <Badge variant="neutral" label={label} className="text-xs" />
    </Karte>
  );
}

/** Der Tooltip mit Links darin – deshalb HoverCard, kein Tooltip: der Link muss erreichbar sein. */
function Karte({ label, content, children }: { label: string; content: ReactNode; children: ReactNode }) {
  return (
    <HoverCard label={label} placement="below" alignment="start" content={<div className="w-80 max-w-[90vw] p-1">{content}</div>}>
      <span tabIndex={0} className="inline-flex cursor-help rounded-sm outline-offset-2">
        {children}
      </span>
    </HoverCard>
  );
}

function Belege({ belege }: { belege: Beleg[] }) {
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {belege.map((b, i) => (
        <li key={i} className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Badge variant="neutral" label={ART[b.source]} className="text-xs" />
            {b.title && (
              <Text type="label" as="span">
                {b.title}
              </Text>
            )}
          </div>
          {b.where && (
            <div>
              <Text type="supporting" as="span" className="text-ink-500">
                {b.where}
              </Text>
            </div>
          )}
          {b.quote && (
            // Der Wortlaut, wie er da stand – in Zeilen, gekürzt: der Tooltip
            // soll den Wert prüfbar machen, nicht die Tabelle ersetzen.
            <div className="line-clamp-4 whitespace-pre-line border-l-2 border-ink-200 pl-2">
              <Text type="supporting" as="span">
                {b.quote}
              </Text>
            </div>
          )}
          {b.url && (
            <div>
              <Link href={b.url} target="_blank" rel="noreferrer">
                Öffnen ↗
              </Link>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Warum das Feld keine Herkunft hat: der Hausstand – und was überhaupt gelesen werden konnte. */
function Grund({ fehlt, quellen, belege }: { fehlt: string; quellen: Quellenlage; belege: Beleg[] }) {
  return (
    <div className="space-y-3">
      <div>
        <Text type="supporting" as="span">
          {fehlt}
        </Text>
      </div>
      {belege.length > 0 && (
        <div className="space-y-2">
          <div>
            <Text type="supporting" as="span" className="text-ink-500">
              Gelesen, nicht übernommen
            </Text>
          </div>
          <Belege belege={belege} />
        </div>
      )}
      {quellen.gelesen.length > 0 && (
        <div>
          <Text type="supporting" as="span" className="text-ink-500">
            Nicht genannt in: {quellen.gelesen.join(", ")}.
          </Text>
        </div>
      )}
      {quellen.fehlt.length > 0 && (
        <div>
          <Text type="supporting" as="span" className="text-ink-500">
            Nicht lesbar: {quellen.fehlt.join("; ")}.
          </Text>
        </div>
      )}
    </div>
  );
}
