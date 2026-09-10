"use client";

/**
 * Schirm 1: der Auftrag. Keine Felder – eine Liste der ClickUp-Aufgaben im
 * Status „kampagne anlegen“, eigene zuerst. Ein Klick, und der Vorschlag baut
 * sich. Wer keine Aufgabe hat, geht unten den alten Weg: Kunde wählen, Rest
 * leer.
 */

import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  Banner,
  Button,
  Heading,
  Kbd,
  Section,
  Skeleton,
  Switch,
  Text,
  TextArea,
  TextInput,
  Typeahead,
  type SearchSource,
  type SearchableItem,
} from "@astryxdesign/core";
import { UserPlusIcon } from "@phosphor-icons/react";
import { MAX_AI_NOTES } from "@/lib/ai-notes";
import type { Source } from "@/lib/brief";
import { taskIdFromInput, type Brief } from "@/lib/clickup";
import { fuzzyCustomerMatch, leadgenTosUrl, type InstagramAccount } from "@/lib/customers";
import { briefsAction } from "../actions";
import { Angaben } from "./angaben";
import form from "./campaign-form.module.css";
import { Herkunft } from "./herkunft";
import { Aufbau } from "./werkstatt";

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function Auftrag({
  email,
  picking,
  aiNotes,
  onAiNotesChange,
  onPick,
  onWithout,
}: {
  /** Die angemeldete Person – ihre Aufgaben stehen oben. */
  email: string;
  /** Die Aufgabe, deren Vorschlag gerade gebaut wird. */
  picking?: string;
  /** Freie Hinweise für die KI – gehen mit der Aufgabe in den Zusammenbau. */
  aiNotes: string;
  onAiNotesChange: (aiNotes: string) => void;
  onPick: (taskId: string) => void;
  onWithout: () => void;
}) {
  const [briefs, setBriefs] = useState<Brief[]>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  useEffect(() => {
    let cancelled = false;
    briefsAction()
      .then((res) => {
        if (cancelled) return;
        setBriefs(res.briefs);
        setError(res.error);
      })
      // Die Aktion fängt selbst; hier bleibt nur die abgerissene Leitung –
      // und die darf den Schirm nicht sperren.
      .catch((e: Error) => {
        if (!cancelled) {
          setBriefs([]);
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mine = useMemo(
    () => (b: Brief) => b.assignees.some((a) => a.toLowerCase() === email.toLowerCase()),
    [email],
  );

  const sorted = useMemo(() => {
    if (!briefs) return [];
    return [...briefs].sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.createdAt - a.createdAt);
  }, [briefs, mine]);

  // Die Liste sieht nur Aufgaben im Status „kampagne anlegen“ – für alles
  // andere (z. B. „kampagne vorbereiten“) gibt es den direkten Weg über Link
  // oder ID. Ein Treffer per ID/Link umgeht Suchtext und „Nur meine“ immer
  // und steht oben – als Extra-Zeile, wenn die Aufgabe nicht geladen ist,
  // sonst direkt vorgezogen in der gefilterten Liste.
  const directId = taskIdFromInput(query);
  const directBrief = directId ? briefs?.find((b) => b.taskId === directId) : undefined;
  const extraId = directId && !directBrief ? directId : undefined;

  const filtered = useMemo(() => {
    const q = query.trim();
    const passes = (b: Brief) =>
      (!mineOnly || mine(b)) &&
      (!q || fuzzyCustomerMatch([b.customer, b.name, ...b.assignees].join(" "), q));
    const direct = directId ? sorted.find((b) => b.taskId === directId) : undefined;
    const rest = sorted.filter((b) => b.taskId !== directId && passes(b));
    return direct ? [direct, ...rest] : rest;
  }, [sorted, mineOnly, query, mine, directId]);

  if (picking) return (
    <section className={form.taskShell}>
      <header className={form.taskHeader}>
        <div><Heading level={2}>Der Vorschlag entsteht</Heading><Text type="supporting" color="secondary" as="p">Die Quellen werden gelesen. Gefundene Angaben erscheinen direkt am passenden Feld.</Text></div>
      </header>
      <Aufbau task={briefs?.find((b) => b.taskId === picking)} taskId={picking} />
    </section>
  );

  return (
    <section className={form.taskShell} aria-label="Auftrag wählen">
      <header className={form.taskHeader}>
        <div><Heading level={2}>Welche Kampagne ist dran?</Heading><Text type="supporting" color="secondary" as="p" className="max-w-prose">Wähle einen Auftrag aus ClickUp. Budget, Rollen, Standort und Benefits werden als Vorschlag übernommen und bleiben bearbeitbar.</Text></div>
      </header>
      {error && <Section padding={6}><Banner status="error" title="ClickUp nicht erreichbar" description={error} /></Section>}
      {briefs && <div className={form.taskTools}>
        <div className={form.taskSearch}>
          <TextInput label="Aufgabe suchen" placeholder="Kunde, Aufgabe oder ClickUp-Link…" value={query} onChange={setQuery} hasClear width="100%" />
          <Switch label="Nur meine Aufgaben" value={mineOnly} onChange={setMineOnly} />
          <Text type="supporting" as="p">Auch Aufgaben in anderen Status lassen sich über ihren ClickUp-Link oder ihre ID laden.</Text>
          <Text type="supporting" as="p" aria-live="polite">{filtered.length + (extraId ? 1 : 0)} {filtered.length + (extraId ? 1 : 0) === 1 ? "Aufgabe" : "Aufgaben"} gefunden</Text>
        </div>
        <HinweiseFeld value={aiNotes} onChange={onAiNotesChange} />
      </div>}
      {!briefs ? <div className="space-y-4 p-6">{[0, 1, 2].map(i => <Skeleton key={i} height={72} width="100%" radius={2} index={i} />)}</div> : filtered.length || extraId ? (
        <ul className={form.taskList}>
          {extraId && <li className={form.taskRow}><div><h3>Aufgabe aus ClickUp laden</h3><p>{extraId}</p></div><Button variant="secondary" label="Vorschlag erstellen" isDisabled={Boolean(picking)} onClick={() => onPick(extraId)} /></li>}
          {filtered.map(b => <li key={b.taskId} className={form.taskRow}>
            <div><h3>{b.customer || b.name}</h3><p>{[b.customer ? b.name : undefined, b.assignees.join(", ") || "niemand zuständig", b.dailyBudgetEuros !== undefined ? `${money.format(b.dailyBudgetEuros)} / Tag` : undefined].filter(Boolean).join(" · ")}</p></div>
            <Button variant="secondary" label="Vorschlag erstellen" isDisabled={Boolean(picking)} onClick={() => onPick(b.taskId)} />
          </li>)}
        </ul>
      ) : !error && <Section padding={6}><Text as="p">{briefs.length ? "Keine Aufgabe passt zur Suche. Ändere den Suchtext oder den Filter." : "Keine Aufgabe im Status „Kampagne anlegen“. Du kannst auch ohne Aufgabe beginnen."}</Text></Section>}
      <footer className={form.taskFooter}><Button variant="ghost" label="Ohne Aufgabe beginnen" onClick={onWithout} isDisabled={Boolean(picking)} /></footer>
    </section>
  );
}

/**
 * Die Hinweise für die KI – hier vor der Aufgabenwahl, im Vorschlag noch einmal
 * (vorschlag.tsx). Sie steuern, was der Kampagnenkontext aus Aufgabe und
 * Onboarding macht, und den Ton der Texte. Optional: leer heißt „wie immer“.
 */
export function HinweiseFeld({
  value,
  onChange,
  description = "Optional. Bei Widerspruch zählt dein Hinweis – Aufgabe und Onboarding erklären den Rest.",
}: {
  value: string;
  onChange: (value: string) => void;
  description?: string;
}) {
  return (
    <TextArea
      label="Hinweise für die KI"
      value={value}
      onChange={onChange}
      rows={3}
      maxLength={MAX_AI_NOTES}
      width="100%"
      placeholder={"z. B.\nNur PFK, keine PDL\nBudget 40 € pro Tag\nTon sachlich, nicht verspielt"}
      description={description}
    />
  );
}

/** Ein beworbener Kunde: die Seite, unter der Anzeigen und Formulare laufen. */
export type WizardClient = {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  instagram?: InstagramAccount;
  /** Seite ohne angenommene Lead-Gen-Bedingungen – siehe LeadgenTosAlert. */
  needsLeadgenTos: boolean;
};

export type ClientItem = SearchableItem<WizardClient> & { auxiliaryData: WizardClient };

// Astryx zeigt von sich aus zehn Einträge; Kunden- wie Kontenliste gehen in die
// Hunderte, und wer ohne Tippen durchsehen will, sähe den Rest nicht.
const MAX_MENU_ITEMS = 500;

/**
 * Astryx' Typeahead filtert über eine SearchSource, nicht über einen
 * filter-Prop. fuzzyCustomerMatch bleibt damit erhalten – getippte Kürzel wie
 * „hkps“ finden „Häusliche Krankenpflege Schölzke“, was ein reiner
 * Teilstring-Vergleich (Astryx' eingebaute Suche) nicht täte. Die Listen liegen
 * fertig im Browser, also ist die Suche synchron und ohne Verzögerung.
 */
export function fuzzySource<T extends SearchableItem>(
  items: T[],
  textOf: (item: T) => string = (item) => item.label,
): SearchSource<T> {
  return {
    bootstrap: () => items,
    search: (query) =>
      query ? items.filter((item) => fuzzyCustomerMatch(textOf(item), query)) : items,
  };
}

/**
 * Der einzige Blocker im Assistenten, den niemand hier beheben kann: Metas
 * Nutzungsbedingungen für Lead-Anzeigen nimmt ein Administrator der Seite in
 * Metas Oberfläche an, über die API geht es nicht. Deshalb kein Hinweis,
 * sondern ein Link — und er steht an der Kundenwahl: vorher fiel das erst beim
 * Anlegen auf, nach allen Uploads und nachdem Kampagne und Anzeigengruppen bei
 * Meta schon standen.
 */
function LeadgenTosAlert({ client }: { client: WizardClient }) {
  return (
    <Banner
      status="error"
      title="Seite hat die Lead-Bedingungen nicht angenommen"
      description={
        <>
          Meta lehnt jede Anzeige über <strong>{client.pageName}</strong> ab, bis ein Administrator
          dieser Seite die Nutzungsbedingungen für Lead-Anzeigen annimmt. Zugriff auf das zahlende
          Werbekonto genügt dafür nicht.
        </>
      }
      endContent={
        // target="_blank": der Entwurf liegt im sessionStorage dieses Tabs, und
        // wer ihn zum Annehmen verlässt, käme sonst auf einen leeren Assistenten
        // zurück.
        <Button
          label="Bei Meta annehmen"
          href={leadgenTosUrl(client.pageId)}
          target="_blank"
          rel="noreferrer"
          variant="secondary"
          size="sm"
        />
      }
    />
  );
}

/**
 * Die Kundenwahl – Schirm 1, sobald ein Kunde feststeht oder jemand ohne
 * Aufgabe beginnt. Ein Feld, zwei Wirkungen: die Seite des Kunden trägt
 * Anzeigen und Lead-Formulare, sein Name baut den Kampagnennamen.
 */
export function KundeWahl({
  clientSource,
  clientItem,
  clientNameSource,
  onChange,
  customerFieldRef,
  reloading,
  onReload,
  client,
  accountName,
  instagramLabel,
  unmatchedName,
  onOtherTask,
}: {
  clientSource: SearchSource<ClientItem>;
  clientItem: ClientItem | null;
  /** Woher der Kundenname kommt, solange ihn niemand geändert hat. */
  clientNameSource?: Source[];
  onChange: (item: ClientItem | null) => void;
  customerFieldRef: RefObject<HTMLDivElement | null>;
  reloading: boolean;
  onReload: () => void;
  client?: WizardClient;
  accountName?: string;
  instagramLabel?: string;
  /** Der Kundenname aus ClickUp, der in der Meta-Liste nicht gefunden wurde. */
  unmatchedName?: string;
  /** Zurück zur Aufgabenliste – nur, wenn man von dort kam. */
  onOtherTask?: () => void;
}) {
  return (
    <div className={form.stack}>
      {unmatchedName && (
        <Banner
          status="warning"
          title={`„${unmatchedName}“ steht nicht in der Meta-Kundenliste`}
          description="So heißt der Kunde in ClickUp. Wähle unten die passende Seite — der Kampagnenname bleibt, wie er ist."
        />
      )}

      {/* Die Suche ist lokal und sofort; beim Laden der Meta-Liste deckt
          loading.tsx genau diese Fläche mit Skeletons ab. */}
      <div className={form.section}>
        <div className="flex items-end gap-2">
          {/* Astryx' Typeahead ist selbst das Suchfeld – der Umweg über
              Auslöser, Popover und ein zweites SearchField darin entfällt,
              und mit hasEntriesOnFocus öffnet sich beim Hineinspringen die
              volle Kundenliste, genau wie vorher beim Aufklappen. */}
          <Typeahead
            label="Beworbener Kunde"
            isRequired
            placeholder="Kunde suchen…"
            searchSource={clientSource}
            value={clientItem}
            onChange={onChange}
            hasEntriesOnFocus
            maxMenuItems={MAX_MENU_ITEMS}
            debounceMs={0}
            emptySearchResultsText="Kein Kunde gefunden"
            ref={customerFieldRef}
            className="min-w-0 flex-1"
          />

          <Button
            isIconOnly
            variant="secondary"
            label="Neuen Kunden nachladen"
            tooltip="Seite im Business Manager dem System User zuweisen, dann hier nachladen."
            icon={<UserPlusIcon aria-hidden size={20} weight="bold" />}
            isLoading={reloading}
            onClick={onReload}
          />
        </div>

        <Herkunft source={clientNameSource} />

        {/* Das Kürzel stand vorher als dritter kleiner Kasten in der Reihe
            – neben dem Löschknopf des Feldes und dem Knopf „Kunde
            hinzufügen" waren das drei Quadrate nebeneinander, von denen
            nur zwei anklickbar sind. Als Satz unter dem Feld sagt es, was
            es ist, und die Reihe trägt nur noch Bedienbares. */}
        <Text type="supporting" as="p">
          <Kbd keys="shift+k" /> öffnet die Kundensuche von überall.
        </Text>
      </div>

      {client?.needsLeadgenTos && <LeadgenTosAlert client={client} />}

      {/* Wer zahlt, unter wessen Seite veröffentlicht wird und ob Instagram
          dabei ist, sind drei Antworten – vorher standen sie als ein Satz
          mit Mittelpunkt da und mussten gelesen statt überflogen werden. */}
      {client && (
        <div>
          <Angaben
            titel="Das steckt hinter dieser Wahl"
            rows={[
              ["Seite (veröffentlicht)", client.pageName],
              ["Werbekonto (zahlt)", accountName ?? "—"],
              ["Instagram", instagramLabel ?? "nur Facebook-Seite"],
            ]}
          />
        </div>
      )}

      {onOtherTask && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            label="Andere Aufgabe wählen – Entwurf verwerfen"
            onClick={onOtherTask}
          />
        </div>
      )}
    </div>
  );
}
