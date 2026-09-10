"use client";

/**
 * Schirm 2, oberer Teil: der Kampagnenname als Ergebnis, die Rollen (mit
 * Herkunft), das Tagesbudget als Pflichtfeld, die Hinweise aus der Aufgabe.
 * Darunter, eingeklappt, alles Optionale: Werbekonto, Startdatum,
 * Ausgabenlimit, Name von Hand, Kürzel. Die Anzeigengruppen rendert wizard.tsx
 * dazwischen – sie sind die Arbeit, das hier ist der Rahmen.
 */

import {
  Banner,
  Button,
  Collapsible,
  DateInput,
  Heading,
  MultiSelector,
  NumberInput,
  Text,
  TextInput,
  Typeahead,
  type ISODateString,
  type SearchSource,
  type SearchableItem,
} from "@astryxdesign/core";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { ROLES } from "@/lib/naming";
import { Angaben, Infotafel } from "./angaben";
import form from "./campaign-form.module.css";
import { HinweiseFeld } from "./auftrag";
import { Herkunft } from "./herkunft";
import { edited, type SourceField, type WizardState } from "./state";

/** Ein Werbekonto, das zahlen kann – unabhängig davon, für wen. */
export type WizardAccount = { id: string; name: string; customerId: string; customerName: string };
export type AccountItem = SearchableItem<WizardAccount> & { auxiliaryData: WizardAccount };

const NAME_EDITED_HINT = "Von Hand geändert — der Name folgt den Feldern nicht mehr.";

// Das Datum liegt als yyyy-mm-dd im State (round-trip durch sessionStorage),
// der Kalender rechnet in CalendarDate. parseDate wirft bei allem, was nicht
// passt – ein kaputter sessionStorage-Eintrag darf den Wizard nicht abschießen.
const toCalendarDate = (iso: string) => {
  try {
    return parseDate(iso);
  } catch {
    return today(getLocalTimeZone());
  }
};

// Astryx' DateInput rechnet in ISO-Strings statt in CalendarDate.
// CalendarDate.toString() liefert immer yyyy-mm-dd, was TypeScript einem
// string nicht ansieht – daher die eine Zusicherung hier.
const toIsoDate = (iso: string) => toCalendarDate(iso).toString() as ISODateString;

export function VorschlagKopf({
  state,
  setState,
  warnings,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  /** Was beim Zusammensetzen nicht gelesen werden konnte (lib/brief.ts). */
  warnings: string[];
}) {
  const set = (field: SourceField, patch: Partial<WizardState>) =>
    setState((s) => edited(s, field, patch));
  return (
    <section className={form.section}>
      {/* Derselbe Kopf wie die Abschnitte der Anzeigengruppe (ad-set-block.tsx,
          FieldsetSection): Titel, ein Satz. Der Abschnitt steht unter den
          Standorten, damit er beim Fertigwerden unten anwächst statt oben
          einzurücken. */}
      <div className={form.stepHeader}>
        <Heading level={3}>Kampagne</Heading>
        <Text type="supporting" color="secondary" as="p" className="max-w-prose">
          Name, Rollen und Tagesbudget für alle Standorte. Der Name baut sich aus Kunde, Rollen, Datum und
          Kürzel.
        </Text>
      </div>
      <div className="flex flex-col gap-6">
      {/* Der Name ist ein Ergebnis, keine Eingabe – gerahmt wie ein Wert. */}
      <div className={form.name}>
        <div><span>Kampagnenname</span><p>{state.campaignName || "Wird aus den Angaben erstellt…"}</p></div>
        {state.nameEdited && (
          <Button
            variant="ghost"
            size="sm"
            label="Automatisch benennen"
            onClick={() => setState((s) => ({ ...s, nameEdited: false }))}
          />
        )}
      </div>

      {warnings.length > 0 && (
        <Banner
          status="warning"
          title="Nicht alles konnte gelesen werden"
          description={
            <ul className="list-disc space-y-1 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}

      <div className={form.fieldGrid}>
        <div className={form.field}>
          <MultiSelector
            label="Gesuchte Rollen"
            options={ROLES.map((r) => ({ value: r.code, label: r.label }))}
            value={state.roles}
            onChange={(roles) => set("roles", { roles })}
            placeholder="Rollen wählen…"
            triggerDisplay="badges"
            hasSearch={ROLES.length > 15}
            searchPlaceholder="Rolle suchen…"
            description="Die Kürzel landen im Namen und in den Texten."
            width="100%"
          />
          <Herkunft source={state.sources.roles} />
        </div>
        <TextInput
          label="Weitere Rolle"
          value={state.roleFreeText}
          onChange={(roleFreeText) => setState((s) => ({ ...s, roleFreeText }))}
          placeholder="z. B. Koch"
          description="Für Einzelfälle ohne Kürzel — steht unverändert im Namen."
          width="100%"
        />
        <div className={form.field}>
          <NumberInput
            label="Tagesbudget"
            value={state.dailyBudgetEuros}
            onChange={(dailyBudgetEuros) => set("dailyBudget", { dailyBudgetEuros })}
            min={1}
            step={0.01}
            units="€"
            isRequired
            description="Gilt für die ganze Kampagne."
            width="100%"
          />
          <Herkunft source={state.sources.dailyBudget} />
        </div>
      </div>

      {/* Bleibt editierbar: eine Änderung wirkt beim nächsten „Mit KI
          überarbeiten“, ohne ClickUp und Drive neu zu lesen. */}
      <div className="max-w-3xl">
        <HinweiseFeld
          value={state.aiNotes}
          onChange={(aiNotes) => setState((s) => ({ ...s, aiNotes }))}
          description="Wirkt beim nächsten „Mit KI überarbeiten“ auf Primärtexte, Überschriften und Beschreibung."
        />
      </div>

      {state.notes && (
        <Infotafel titel="Hinweise aus der Aufgabe">
          {/* Wörtlich und als Text: das sind Anweisungen für Menschen
              („Creatives von letzter Kampagne nehmen“), keine Felder. */}
          <pre className="text-ink-700 px-2 pb-2 font-sans text-sm whitespace-pre-wrap">
            {state.notes}
          </pre>
        </Infotafel>
      )}
      </div>
    </section>
  );
}

export function Optional({
  state,
  setState,
  accountSource,
  accountItem,
  prefill,
  fixed,
}: {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  accountSource: SearchSource<AccountItem>;
  accountItem: AccountItem | null;
  prefill: "loading" | "applied" | "none";
  /** Die Festwerte aus wizard.tsx (FIXED). */
  fixed: [string, string][];
}) {
  const set = (field: SourceField, patch: Partial<WizardState>) =>
    setState((s) => edited(s, field, patch));
  return (
    <Collapsible className={form.options} defaultIsOpen={false} trigger="Optionale Einstellungen">
      <div className={`${form.fieldGrid} ${form.optionFields}`}>
        <div className={`${form.field} ${form.fullWidth}`}>
          <Typeahead
            label="Werbekonto (zahlt)"
            placeholder="Werbekonto suchen…"
            searchSource={accountSource}
            value={accountItem}
            onChange={(item) => setState((s) => ({ ...s, adAccount: item?.id ?? "" }))}
            hasEntriesOnFocus
            maxMenuItems={200}
            debounceMs={0}
            emptySearchResultsText="Kein Werbekonto gefunden"
            renderItem={(item) => (
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                <span className="text-ink-500 block truncate text-xs">
                  {item.auxiliaryData.customerName}
                </span>
              </span>
            )}
            width="100%"
          />
          {/* Steht neben dem Feld statt in dessen description-Slot: der Satz
              wechselt, während man hinschaut, und aria-live sagt das an – ein
              description kann das nicht. */}
          {prefill !== "none" && (
            <Text type="supporting" as="p" aria-live="polite">
              {prefill === "loading"
                ? "Die letzte Kampagne dieses Kontos wird nach Standort und Radius durchsucht…"
                : "Standort und Radius kommen aus der letzten Kampagne dieses Kontos."}
            </Text>
          )}
        </div>
        <DateInput
          label="Startdatum"
          value={toIsoDate(state.startDate)}
          onChange={(date) => date && setState((s) => ({ ...s, startDate: date }))}
          description="Steht im Kampagnennamen."
          width="100%"
        />
        <div className={form.field}>
          <NumberInput
            label="Ausgabenlimit"
            value={state.spendCapEuros ?? null}
            hasClear
            onChange={(v) => set("spendCap", { spendCapEuros: v ?? undefined })}
            min={100}
            step={0.01}
            units="€"
            description="Leer heißt keins; sonst mindestens 100 €."
            width="100%"
          />
          <Herkunft source={state.sources.spendCap} />
        </div>
        <div className={form.field}>
          <TextInput
            label="Kürzel im Namen"
            value={state.initials}
            onChange={(initials) => set("initials", { initials })}
            placeholder="z. B. MW"
            description="Steht am Ende des Namens."
            width="100%"
          />
          <Herkunft source={state.sources.initials} />
        </div>
        <TextInput
          label="Kampagnenname von Hand"
          value={state.campaignName}
          onChange={(campaignName) => setState((s) => ({ ...s, campaignName, nameEdited: true }))}
          description={state.nameEdited ? NAME_EDITED_HINT : "Baut sich aus Kunde, Rollen, Datum und Kürzel."}
          width="100%"
        />
        <div className={form.fullWidth}>
          <Angaben titel="Feste Einstellungen" rows={fixed} />
        </div>
      </div>
    </Collapsible>
  );
}
