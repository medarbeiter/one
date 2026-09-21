"use client";

import { Fragment, createContext, useContext, type ReactNode } from "react";
import { Badge, HoverCard, Link, Text } from "@astryxdesign/core";
import type { Beleg, Quellenlage, Source } from "@/lib/brief";
import { Sign, type Meaning } from "@/theme/icons";

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

/** Das Zeichen der Quelle neben dem Titel – der Titel sagt die Art auch in Worten („Aufgabe …“, „Tabelle …“). */
const ZEICHEN: Record<Source, Meaning> = {
  clickup: "task",
  onboarding: "table",
  previous: "campaign",
  session: "login",
  user: "hint",
  campaign: "campaign",
  hand: "edit",
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
 * Herkunft studieren. Die Karte dahinter trägt die Belege: je Dokument ein
 * Kopf mit Link, darunter Stelle und Wortlaut.
 *
 * `fehlt` sagt, was gilt, wenn es keine Herkunft gibt („Hausstandard 17 €“) –
 * dann steht ein stilles Etikett „ohne Quelle“ am Feld, und die Karte nennt
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
        <div className="space-y-4">
          {byHand ? (
            <Absatz>Du hast den Wert geändert. Was die Quellen sagten, steht darunter.</Absatz>
          ) : (
            <section className="space-y-2">
              <Zeile>Übernommen {label}</Zeile>
              {genutzt.length ? <Belege belege={genutzt} /> : <Absatz muted>Kein Wortlaut überliefert.</Absatz>}
            </section>
          )}
          {weitere.length > 0 && (
            <section className="space-y-2">
              <Zeile>{byHand ? "Vorher gelesen" : "Auch gelesen, nicht übernommen"}</Zeile>
              <Belege belege={weitere} />
            </section>
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
    <HoverCard
      label={label}
      placement="below"
      alignment="start"
      content={<div className="w-[22rem] max-w-[90vw] p-1">{content}</div>}
    >
      <span tabIndex={0} className="inline-flex cursor-help rounded-sm outline-offset-2">
        {children}
      </span>
    </HoverCard>
  );
}

/** Die Überschrift eines Abschnitts – klein, gedämpft, in Großbuchstaben: ein Register, kein Satz. */
const Zeile = ({ children }: { children: ReactNode }) => (
  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{children}</div>
);

const Absatz = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <div className={muted ? "text-ink-500" : undefined}>
    <Text type="supporting" as="span">
      {children}
    </Text>
  </div>
);

type Gruppe = { key: string; source: Source; title: string; url?: string; rows: { where?: string; quote: string }[] };

/**
 * Belege nach Dokument gebündelt: die Aufgabe steht einmal, ihre Stellen
 * darunter – nicht dreimal derselbe Titel mit je einem Link.
 */
export function groupBelege(belege: Beleg[]): Gruppe[] {
  const groups = new Map<string, Gruppe>();
  for (const b of belege) {
    const title = b.title ?? HERKUNFT_LABEL[b.source];
    const key = `${b.source}|${title}|${b.url ?? ""}`;
    const g = groups.get(key) ?? { key, source: b.source, title, url: b.url, rows: [] };
    if (b.quote) g.rows.push({ where: b.where, quote: b.quote });
    groups.set(key, g);
  }
  return [...groups.values()];
}

function Belege({ belege }: { belege: Beleg[] }) {
  return (
    <div className="divide-y divide-ink-100">
      {groupBelege(belege).map((g) => (
        <div key={g.key} className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-1.5">
              <Sign meaning={ZEICHEN[g.source]} form="outline" size={16} className="mt-0.5" color="var(--color-icon-secondary)" />
              <Text type="label" as="span" className="line-clamp-2 min-w-0">
                {g.title}
              </Text>
            </div>
            {g.url && (
              <span className="shrink-0 whitespace-nowrap">
                <Link href={g.url} target="_blank" rel="noreferrer">
                  Öffnen ↗
                </Link>
              </span>
            )}
          </div>
          {g.rows.length > 0 && (
            // Stelle links, Wortlaut rechts – wie eine Fußnote: „Feld ‚gesuchte
            // Stellen‘ → s. OB“. Gekürzt: die Karte macht den Wert prüfbar, sie
            // ersetzt die Tabelle nicht.
            <dl className="m-0 grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 pl-[22px]">
              {g.rows.map((r, i) => (
                <Fragment key={i}>
                  <dt className="text-xs leading-5 text-ink-500">{r.where ?? "Wortlaut"}</dt>
                  <dd className="m-0 line-clamp-3 whitespace-pre-line text-sm leading-5 text-ink-900">{r.quote}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

/** Warum das Feld keine Herkunft hat: der Hausstand – und was überhaupt gelesen werden konnte. */
function Grund({ fehlt, quellen, belege }: { fehlt: string; quellen: Quellenlage; belege: Beleg[] }) {
  return (
    <div className="space-y-4">
      <Absatz>{fehlt}</Absatz>
      {(quellen.gelesen.length > 0 || quellen.fehlt.length > 0) && (
        <dl className="m-0 grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
          {quellen.gelesen.length > 0 && (
            <>
              <dt className="text-xs leading-5 text-ink-500">Nicht genannt in</dt>
              <dd className="m-0 text-sm leading-5 text-ink-900">{quellen.gelesen.join(", ")}</dd>
            </>
          )}
          {quellen.fehlt.length > 0 && (
            <>
              <dt className="text-xs leading-5 text-ink-500">Nicht lesbar</dt>
              <dd className="m-0 text-sm leading-5 text-ink-900">{quellen.fehlt.join("; ")}</dd>
            </>
          )}
        </dl>
      )}
      {belege.length > 0 && (
        <section className="space-y-2">
          <Zeile>Gelesen, nicht übernommen</Zeile>
          <Belege belege={belege} />
        </section>
      )}
    </div>
  );
}
