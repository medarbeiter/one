"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Button,
  Calendar,
  Card,
  Checkbox,
  CheckboxGroup,
  Chip,
  DateField,
  DatePicker,
  Description,
  Disclosure,
  DisclosureGroup,
  EmptyState,
  Fieldset,
  Input,
  Kbd,
  Label,
  ListBox,
  NumberField,
  SearchField,
  Select,
  Separator,
  TextField,
  Typography,
} from "@heroui/react";
import {
  Badge,
  Banner,
  Button as AstryxButton,
  ProgressBar,
  Text,
} from "@astryxdesign/core";
import { CaretRightIcon, UserPlusIcon } from "@phosphor-icons/react";
// React.Key kennt bigint, react-aria nicht – Collections rechnen mit dem
// engeren Typ, sonst passt das Set nicht auf onExpandedChange.
import { type Key } from "@heroui/react/rac";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { campaignName, ROLES } from "@/lib/naming";
import { label, plural } from "@/lib/labels";
import { duplicateLocations, locationSummary, placeTextValue } from "@/lib/geo";
import {
  DEFAULT_RADIUS_KM,
  adSetBlockers,
  borrowersOf,
  customerBlockers,
  detailBlockers,
  emptyAdSet,
  initialState,
  syncLinkedAds,
  toAdInput,
  useWizardState,
  withArrivedAssets,
  type WizardAdSet,
} from "./state";
import { drainArrived, useUploadVersion } from "./upload-queue";
import { AdSetBlock } from "./ad-set-block";
import { Stepper } from "./stepper";
import { Preview } from "./preview";
import { ReceiptPanel } from "./receipt";
import { prefillAction, type WizardSubmission } from "../actions";
import { useLaunch } from "./use-launch";
import {
  fuzzyCustomerMatch,
  instagramAccountLabel,
  leadgenTosUrl,
  resolveClientByName,
  type InstagramAccount,
} from "@/lib/customers";
import type { LaunchProgress } from "@/lib/launch";
import type { Prefill } from "@/lib/prefill";

/** Ein Werbekonto, das zahlen kann – unabhängig davon, für wen. */
type WizardAccount = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
};

/** Ein beworbener Kunde: die Seite, unter der Anzeigen und Formulare laufen. */
type WizardClient = {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  instagram?: InstagramAccount;
  /** Seite ohne angenommene Lead-Gen-Bedingungen – siehe LeadgenTosAlert. */
  needsLeadgenTos: boolean;
};

// Vorbelegung greift nur, solange niemand das jeweilige Feld angefasst hat –
// "angefasst" heißt hier: noch auf dem Ausgangswert aus emptyAdSet(). Das ist
// gröber als ein echtes touched-Flag pro Feld, aber genau das reicht: sobald
// jemand tippt, weicht der Wert vom Default ab und wird nie wieder überschrieben.
function untouchedPrefillPatch(current: WizardAdSet, prefill: Prefill): Partial<WizardAdSet> {
  const patch: Partial<WizardAdSet> = {};
  if (current.addressString === "" && prefill.addressString)
    patch.addressString = prefill.addressString;
  // Zielte die letzte Kampagne auf eine Stadt, kommt sie als Ort zurück. Der
  // Name daran ist nur die Beschriftung – gebucht wird über den Schlüssel, und
  // den liefert Meta beim Lesen mit.
  if (current.addressString === "" && !current.place && prefill.place) {
    patch.place = prefill.place;
    patch.addressString = placeTextValue(prefill.place);
  }
  if (current.radiusKm === DEFAULT_RADIUS_KM && prefill.radiusKm !== undefined)
    patch.radiusKm = prefill.radiusKm;
  return patch;
}

// Das Datum liegt als yyyy-mm-dd im State (round-trip durch sessionStorage),
// der DatePicker rechnet in CalendarDate. parseDate wirft bei allem, was nicht
// passt – ein kaputter sessionStorage-Eintrag darf den Wizard nicht abschießen.
const toCalendarDate = (iso: string) => {
  try {
    return parseDate(iso);
  } catch {
    return today(getLocalTimeZone());
  }
};

// Die festen Werte der Kampagne. Sie stehen nicht zur Wahl, aber jemand muss
// sie nachschlagen können – als Paare statt als acht Sätze untereinander.
const FIXED: [string, string][] = [
  ["Ziel", label("OUTCOME_LEADS")],
  ["Optimierungsziel", label("LEAD_GENERATION")],
  ["Zieltyp", label("ON_AD")],
  ["Gebotsstrategie", label("LOWEST_COST_WITHOUT_CAP")],
  ["Abrechnungsereignis", label("IMPRESSIONS")],
  ["Anzeigenkategorie", label("EMPLOYMENT")],
  ["Land", label("DE")],
  ["Platzierungen", [label("feed"), label("stream"), label("story")].join(", ")],
];

// Anzeigen vor Details: das Hochladen und Zuschneiden der Inhalte dauert am
// längsten und läuft im Hintergrund weiter (siehe upload-queue.ts). Wer es als
// erstes anstößt, füllt Name, Budget und Datum aus, während die Dateien laufen –
// umgekehrt wartet man am Ende vor einem fertigen Formular auf die Uploads.
const STEPS = ["Kunde", "Anzeigen", "Details", "Überprüfung"];

// Dieselbe Schreibweise wie in den Eingabefeldern darüber – „17.00 €“ neben
// „17,00 €“ liest sich wie zwei verschiedene Beträge.
const money = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/**
 * Was gerade bei Meta angelegt wird. Jede Anzeige sind zwei Aufrufe gegen deren
 * Server, eine übliche Kampagne über dreißig – ohne Zähler ist eine Minute
 * Warten nicht von einem Hänger zu unterscheiden, und genau dann legt jemand
 * dieselbe Kampagne ein zweites Mal an.
 */
function LaunchProgressBar({ progress }: { progress: LaunchProgress }) {
  const { label: text, done, total } = progress;
  return (
    <div className="space-y-1" aria-live="polite">
      {/* Solange der Server noch nicht weiß, wie viele Schritte kommen, ist der
          Balken unbestimmt – ein Balken bei 0 % sieht aus wie ein Hänger. */}
      <ProgressBar
        label={`${text}…`}
        value={done}
        max={total || 1}
        isIndeterminate={!total}
        hasValueLabel={total > 0}
        formatValueLabel={(v, m) => `${v} / ${m}`}
      />
      <Text type="supporting">
        Lass diesen Tab offen — wenn du ihn schließt, stoppt der Lauf mittendrin.
      </Text>
    </div>
  );
}

/** Der Zähler offener Punkte an einem Schritt oder Standort. */
function IssueChip({ count }: { count: number }) {
  return (
    <Badge
      variant={count ? "error" : "success"}
      className="tabular-nums"
      label={count ? `${count} offen` : "bereit"}
    />
  );
}

/**
 * Der einzige Blocker im Assistenten, den niemand hier beheben kann: Metas
 * Nutzungsbedingungen für Lead-Anzeigen nimmt ein Administrator der Seite in
 * Metas Oberfläche an, über die API geht es nicht. Deshalb kein Hinweis,
 * sondern ein Link — und er steht in Schritt 1, direkt an der Kundenwahl:
 * vorher fiel das erst beim Anlegen auf, nach allen Uploads und nachdem
 * Kampagne und Anzeigengruppen bei Meta schon standen.
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
        <AstryxButton
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
 * Beschriftung/Wert-Paare – für die Zusammenfassung und die Festwerte.
 * Einspaltig, wo die Fläche schmal ist: drei Zeilen über zwei Spalten lassen
 * eine halbe Zeile leer stehen und sehen aus, als fehle dort etwas.
 */
function Facts({ rows, columns = 2 }: { rows: [string, string][]; columns?: 1 | 2 }) {
  return (
    // Wert direkt neben der Beschriftung statt an den gegenüberliegenden Rand
    // gedrückt: über eine halbe Kartenbreite hinweg stand jeder Wert näher an
    // der Beschriftung der *nächsten* Spalte als an seiner eigenen.
    <dl className={`grid gap-x-10 gap-y-2 text-sm ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,11rem)_1fr] items-baseline gap-3">
          <dt className="text-ink-500 truncate text-xs">{k}</dt>
          <dd className="min-w-0 truncate font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

type WizardProps = {
  accounts: WizardAccount[];
  clients: WizardClient[];
  knownInitials: string[];
  defaultAccount: string;
  defaultBusiness: string;
};

export function Wizard(props: WizardProps) {
  // Die feste Sprache kommt jetzt aus lib/intl-de.ts, einmal fürs ganze
  // Layout gesetzt (siehe app/layout.tsx) statt hier pro Assistent gekapselt –
  // Astryx hat kein I18nProvider-Gegenstück.
  return <WizardSteps {...props} />;
}

function WizardSteps({
  accounts,
  clients,
  knownInitials,
  defaultAccount,
  defaultBusiness,
}: WizardProps) {
  const { state, setState, loaded, restored, discard } = useWizardState(
    initialState(defaultAccount, defaultBusiness),
  );
  const [step, setStep] = useState("0");
  const customerTriggerRef = useRef<HTMLDivElement>(null);
  // ⇧K öffnet die Kundensuche von überall, außer jemand tippt gerade in ein
  // Feld. Der Shortcut steht direkt am Feld, damit er nicht entdeckt werden
  // muss. Das native .click() hält Fokus- und Öffnungslogik bei React Aria.
  useEffect(() => {
    const openCustomerSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select") || target?.isContentEditable;
      if (isTyping || !event.shiftKey || event.key.toLocaleLowerCase("de") !== "k") return;
      event.preventDefault();
      customerTriggerRef.current?.click();
    };
    window.addEventListener("keydown", openCustomerSearch);
    return () => window.removeEventListener("keydown", openCustomerSearch);
  }, []);
  // Standorte starten zugeklappt: aufgeklappt ist ein Block zwei Bildschirm-
  // höhen hoch, und meistens wird nur an einem gearbeitet. Mehrere gleichzeitig
  // sind erlaubt – zum Vergleichen zweier Texte gibt es keinen anderen Weg.
  const [openSets, setOpenSets] = useState<Set<Key>>(new Set());
  // Ein einzelner zugeklappter Standort sieht aus wie eine leere Seite. Die id
  // wechselt beim Wiederherstellen eines Entwurfs, deshalb am Wert hängend.
  const firstSetId = state.adSets[0]?.id;
  useEffect(() => {
    if (firstSetId) setOpenSets(new Set([firstSetId]));
  }, [firstSetId]);
  // Der Name baut sich selbst; das Feld dafür erscheint erst auf Wunsch.
  const [editingName, setEditingName] = useState(false);
  // Welcher Standort in der Vorschau der Überprüfung steht. Über die id, nicht
  // den Index: wird ein Standort davor entfernt, zeigte ein Index still auf
  // einen anderen. Fehlt die id, gilt der erste Standort.
  const [previewSetId, setPreviewSetId] = useState<string>();
  // Der Weg von den Überschriften zu den Rollen. Die beiden hängen zusammen –
  // ohne Rolle hat der Generator nur die neutralen Vorlagen – stehen aber einen
  // Schritt auseinander. Der Sprung nimmt den Schrittwechsel und das Suchen im
  // langen Formular in einem Klick ab.
  const rolesRef = useRef<HTMLDivElement>(null);
  const [rolesWanted, setRolesWanted] = useState(false);
  const goToRoles = () => {
    setStep("2");
    setRolesWanted(true);
  };
  // Erst nach dem Rendern des Schritts – vorher gibt es das Fieldset nicht.
  useEffect(() => {
    if (!rolesWanted || step !== "2") return;
    setRolesWanted(false);
    rolesRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    // Fokus zusätzlich zum Scrollen: wer per Tastatur kommt, sieht das Scrollen
    // nicht als Antwort auf seinen Tastendruck.
    rolesRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, [rolesWanted, step]);
  const { result, progress, pending, run } = useLaunch();
  // Für den Retry-Pfad im Receipt-Panel: das genaue Objekt, das gesendet wurde,
  // nicht der aktuelle (evtl. inzwischen weiterbearbeitete) Wizard-State.
  const [submission, setSubmission] = useState<WizardSubmission | null>(null);

  const account = accounts.find((a) => a.id === state.adAccount);
  // Ein Feld, zwei Aufgaben: der getippte Kundenname baut den Kampagnennamen
  // und wählt zugleich die Seite, unter der Anzeigen und Formulare laufen.
  // Wer den Namen aus der Vorschlagsliste übernimmt, hat die Seite damit schon
  // gewählt – ohne einen zweiten Klick dafür.
  const client = resolveClientByName(clients, state.business);

  // Das Instagram-Konto hängt an der Seite des beworbenen Kunden, nicht am
  // zahlenden Konto. Es kommt mit der Kundenoption vom Server und ist deshalb
  // ohne zweiten Roundtrip sofort da.
  const instagram = client?.instagram;
  const instagramLabel = instagramAccountLabel(instagram);

  // Der Name folgt Business/Rollen/Datum/Initialen, solange niemand ihn von
  // Hand angefasst hat – siehe nameEdited in state.ts.
  const composed = campaignName({
    business: state.business,
    roles: state.roles,
    roleFreeText: state.roleFreeText,
    start: new Date(state.startDate),
    initials: state.initials,
  });
  useEffect(() => {
    if (!state.nameEdited) setState((s) => ({ ...s, campaignName: composed }));
  }, [composed, state.nameEdited, setState]);

  // Adresse, Radius und Texte aus der letzten Kampagne des Kunden übernehmen –
  // aber nur ins erste Ad Set und nur die Felder, die noch am Ausgangswert
  // stehen (untouchedPrefillPatch). Kein Werbekonto (noch) gewählt heißt: nichts
  // zu holen. Das Lead-Formular bleibt bewusst außen vor, siehe state.ts/prefill.ts.
  // Der Zustand ist sichtbar, weil die Vorbelegung Felder ändert, während man
  // hinschaut: ohne Hinweis springt die Adresse aus dem Nichts auf einen Wert,
  // den niemand getippt hat.
  const [prefill, setPrefill] = useState<"loading" | "applied" | "none">("none");
  useEffect(() => {
    const adAccount = state.adAccount;
    if (!adAccount) return;
    let cancelled = false;
    setPrefill("loading");
    prefillAction(adAccount).then((prefill) => {
      if (cancelled) return;
      if (!prefill) return setPrefill("none");
      let applied = false;
      setState((s) => {
        const first = s.adSets[0];
        if (!first) return s;
        const patch = untouchedPrefillPatch(first, prefill);
        if (!Object.keys(patch).length) return s;
        applied = true;
        return {
          ...s,
          adSets: s.adSets.map((set, i) => (i === 0 ? { ...set, ...patch } : set)),
        };
      });
      setPrefill(applied ? "applied" : "none");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.adAccount]);

  // Jede Änderung an den Anzeigengruppen läuft durch syncLinkedAds: geliehene
  // Anzeigen holen sich ihren Inhalt aus der Quelle, und verschwindet die
  // Quelle, stehen sie ab da für sich. Damit ist "verlinkt" kein Zustand, den
  // irgendjemand von Hand nachziehen müsste.
  const updateAdSets = (fn: (sets: WizardAdSet[]) => WizardAdSet[]) =>
    setState((s) => ({ ...s, adSets: syncLinkedAds(fn(s.adSets)) }));

  // Der Patch darf eine Funktion sein: mehrere Uploads laufen gleichzeitig und
  // legen nacheinander Anzeigen an. Aus dem gerenderten `value` gerechnet würde
  // der zweite den ersten überschreiben – aus dem aktuellen Stand nicht.
  const updateAdSet = (
    i: number,
    patch: Partial<WizardAdSet> | ((set: WizardAdSet) => Partial<WizardAdSet>),
  ) =>
    updateAdSets((sets) =>
      sets.map((set, idx) =>
        idx === i ? { ...set, ...(typeof patch === "function" ? patch(set) : patch) } : set,
      ),
    );

  const removeAdSet = (i: number) => updateAdSets((sets) => sets.filter((_, idx) => idx !== i));

  /**
   * Fertig hochgeladene Dateien abholen. Hier und nicht im Block, denn der Block
   * ist genau dann nicht da, wenn es darauf ankommt: er steckt in einem
   * Aufklapper in einem Tab-Panel, und wer während des Uploads weiterarbeitet,
   * hängt ihn aus. Der Assistent steht dagegen, solange die Seite steht – und
   * was ankam, während sie es nicht tat, wartet im Eingang auf diesen Effekt.
   *
   * Geleert wird vor setState: React ruft Updater im Strict Mode zweimal auf,
   * und der zweite Lauf fände einen leeren Eingang vor.
   */
  const uploadVersion = useUploadVersion();
  useEffect(() => {
    // Vor dem Wiederherstellen des Entwurfs stehen hier andere IDs als die, an
    // die die Uploads adressiert sind – das Abgeholte wäre nicht zuzuordnen.
    if (!loaded) return;
    const arrived = drainArrived();
    if (!arrived.size) return;
    updateAdSets((sets) =>
      sets.map((set) => {
        const fresh = arrived.get(set.id);
        return fresh?.length ? { ...set, ...withArrivedAssets(set, fresh) } : set;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadVersion, loaded]);

  // Ein neuer Standort ist der, an dem gearbeitet wird – er klappt auf und die
  // fertigen darüber zu.
  const addLocation = () =>
    setState((s) => {
      const fresh = emptyAdSet(s.adSets.length);
      setOpenSets(new Set([fresh.id]));
      return { ...s, adSets: [...s.adSets, fresh] };
    });

  // Alles, was den Anlegen-Knopf blockiert – jede Zeile ein Fehler, den Meta
  // sonst erst mitten im Anlegen meldet, teils in unverständlichem Deutsch.
  // Nach Schritt sortiert, damit jeder Schritt seine eigenen Punkte trägt.
  const issues = useMemo(() => {
    const perSet = state.adSets.map((s) => ({
      set: s,
      blockers: adSetBlockers(s),
    }));
    return {
      perSet,
      // Ohne Kunde gibt es nichts anzulegen – der Server lehnt ohnehin ab,
      // aber erst nach dem Upload-Umweg.
      customer: [
        ...customerBlockers(state),
        ...(client ? [] : ["Es ist kein Kunde gewählt."]),
        // Blockt den Anlegen-Knopf wie jeder andere offene Punkt. Der Server
        // lehnt denselben Fall in resolveLaunch() noch einmal ab – hier steht er,
        // damit niemand erst acht Dateien hochlädt, um es dann zu erfahren.
        ...(client?.needsLeadgenTos
          ? [`„${client.pageName}“ hat Metas Lead-Bedingungen nicht angenommen.`]
          : []),
      ],
      details: detailBlockers(state),
      adSets: perSet.flatMap(({ set, blockers }) => blockers.map((b) => `„${set.name}“: ${b}`)),
    };
  }, [state, client]);

  const stepIssues = [issues.customer.length, issues.adSets.length, issues.details.length, 0];
  const allIssues = [...issues.customer, ...issues.details, ...issues.adSets];
  const blocked = allIssues.length > 0;

  // Kein Fehler, sondern Geld: zwei Anzeigengruppen am selben Ort bieten bei
  // Meta gegeneinander und treiben den eigenen Preis je Lead hoch. Meta meldet
  // das nicht, und im Ads Manager sieht beides normal aus – deshalb hier, als
  // Hinweis und nicht als Blocker: manchmal ist genau das gewollt.
  const overlaps = useMemo(() => duplicateLocations(state.adSets), [state.adSets]);

  const submitWizard = (input: WizardSubmission) => {
    setSubmission(input);
    run(input);
  };

  const onCreate = () =>
    submitWizard({
      adAccount: state.adAccount,
      // Die Seite folgt dem beworbenen Kunden – der Server löst sie noch einmal
      // selbst auf, ein Client-Feld darf nicht auf eine fremde Seite zeigen.
      clientId: client?.id ?? "",
      campaignName: state.campaignName,
      dailyBudgetCents: Math.round(state.dailyBudgetEuros * 100),
      spendCapCents: state.spendCapEuros ? Math.round(state.spendCapEuros * 100) : undefined,
      // id und loose sind reine UI-Begriffe – AdSetInput (der API-Vertrag) kennt
      // weder das eine noch das andere, und toAdInput streift die UI-Felder der
      // einzelnen Anzeigen ab.
      adSets: state.adSets.map(({ id: _id, loose: _loose, ads, ...rest }) => ({
        ...rest,
        ads: ads.map(toAdInput),
      })),
    });

  const stepIndex = Number(step);
  const previewSet = state.adSets.find((s) => s.id === previewSetId) ?? state.adSets[0];
  // Alles nach der Kundenwahl hängt am Kunden: die Seite trägt die Anzeigen,
  // sein Name baut den Kampagnennamen. Ohne ihn ist jeder weitere Schritt eine
  // Eingabe, die man später noch einmal machen darf.
  const locked = !client;

  return (
    <div className="space-y-4">
      {/* Ein wiederhergestellter Entwurf sieht aus wie ein frisch ausgefüllter –
          ohne diesen Hinweis baut jemand auf den Zahlen von gestern weiter. */}
      {restored && (
        <Banner
          status="warning"
          title="Entwurf wiederhergestellt"
          description="Die Eingaben stammen aus einer früheren Sitzung in diesem Tab."
          endContent={
            <Button variant="outline" size="sm" onPress={discard}>
              Neu beginnen
            </Button>
          }
        />
      )}

      {/* Die Karte legt ihre eigenen 16 px ab: Die Schrittleiste soll bis an
          beide Kanten reichen, und die Abschnitte darunter tragen mit 24 px
          mehr Rand, als eine Karte von sich aus gibt. */}
      <Card className="gap-0 overflow-hidden p-0">
        {/* Der Zähler steht am Schritt, nicht erst am Ende: sonst erfährt man
            vom fehlenden Formular nach acht Uploads. Gesperrt, solange kein
            Kunde gewählt ist – siehe `locked`. */}
        <Stepper
          steps={STEPS.map((label, i) => ({ label, issues: stepIssues[i] }))}
          current={stepIndex}
          onSelect={(i) => setStep(String(i))}
          lockedFrom={locked ? 1 : STEPS.length}
        />

        {/* ------------------------------------------------ Schritt 1: Kunde */}
        {stepIndex === 0 && (
          <div className="space-y-6 p-6">
            {/* Ein Feld, zwei Wirkungen: die Seite des Kunden trägt Anzeigen und
                Lead-Formulare, sein Name baut den Kampagnennamen. Die Suche ist
                lokal und sofort; beim Laden der Meta-Liste deckt loading.tsx
                genau diese Fläche mit HeroUI-Skeletons ab. */}
            <div className="flex max-w-xl items-end gap-2">
              <Autocomplete
                fullWidth
                selectionMode="single"
                value={client?.id ?? null}
                onChange={(key) =>
                  setState((s) => ({
                    ...s,
                    business: clients.find((c) => c.id === String(key))?.name ?? "",
                  }))
                }
                placeholder="Kunde suchen…"
                isRequired
              >
                <Label>Beworbener Kunde</Label>
                <Autocomplete.Trigger ref={customerTriggerRef}>
                  <Autocomplete.Value />
                  {/* Das Kürzel steht im Feld, nicht neben der Beschriftung:
                      dort saß es zwischen Text und Pflicht-Stern und sah aus
                      wie ein drittes, halb ausgerichtetes Etwas. */}
                  <Kbd className="ms-auto">
                    <Kbd.Abbr keyValue="shift" />
                    <Kbd.Content>K</Kbd.Content>
                  </Kbd>
                  <Autocomplete.ClearButton />
                  <Autocomplete.Indicator />
                </Autocomplete.Trigger>
                <Autocomplete.Popover>
                  <Autocomplete.Filter filter={fuzzyCustomerMatch}>
                    <SearchField autoFocus name="customer-search" variant="secondary">
                      <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="Kunden durchsuchen…" />
                        <SearchField.ClearButton />
                      </SearchField.Group>
                    </SearchField>
                    <ListBox
                      items={clients}
                      renderEmptyState={() => <EmptyState>Kein Kunde gefunden</EmptyState>}
                    >
                      {(c: WizardClient) => (
                        <ListBox.Item id={c.id} textValue={c.name}>
                          {c.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      )}
                    </ListBox>
                  </Autocomplete.Filter>
                </Autocomplete.Popover>
              </Autocomplete>

              {/* Absichtlich noch ohne Aktion: der Einstieg ist sichtbar, ohne
                  eine Kundenanlage vorzutäuschen, die es im Backend nicht gibt. */}
              <Button isIconOnly variant="secondary" aria-label="Kunde hinzufügen">
                <UserPlusIcon aria-hidden size={20} weight="bold" />
              </Button>
            </div>

            {client?.needsLeadgenTos && <LeadgenTosAlert client={client} />}

            {/* Wer zahlt, unter wessen Seite veröffentlicht wird und ob Instagram
                dabei ist, sind drei Antworten – vorher standen sie als ein Satz
                mit Mittelpunkt da und mussten gelesen statt überflogen werden. */}
            {client ? (
              <Card variant="secondary" className="max-w-xl">
                <Card.Header>
                  <Card.Title>Das steckt hinter dieser Wahl</Card.Title>
                </Card.Header>
                <Card.Content>
                  <Facts
                    columns={1}
                    rows={[
                      ["Seite (veröffentlicht)", client.pageName],
                      ["Werbekonto (zahlt)", account?.name ?? "—"],
                      ["Instagram", instagramLabel ?? "nur Facebook-Seite"],
                    ]}
                  />
                </Card.Content>
              </Card>
            ) : (
              <Description>
                Die weiteren Schritte öffnen sich, sobald ein Kunde gewählt ist — seine
                Facebook-Seite trägt die Anzeigen und Lead-Formulare.
              </Description>
            )}

            {/* Fast immer MedArbeiter; die Ausnahme liegt eine Ebene tiefer und
                hält so den üblichen Pfad kurz. Öffnen und Schließen folgen
                demselben Weg; reduzierte Bewegung schaltet die Drehung aus. */}
            <Disclosure>
              <Disclosure.Heading>
                <Disclosure.Trigger className="group text-ink-700 flex w-full items-center gap-2 py-2 text-left text-sm font-medium">
                  Erweiterte Einstellungen anzeigen
                  <CaretRightIcon
                    aria-hidden
                    className="transition-transform duration-300 ease-out group-aria-expanded:rotate-90 motion-reduce:transition-none"
                    size={16}
                    weight="bold"
                  />
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="pb-2">
                  <Autocomplete
                    fullWidth
                    selectionMode="single"
                    value={state.adAccount || null}
                    onChange={(key) =>
                      setState((s) => ({
                        ...s,
                        adAccount: key ? String(key) : "",
                      }))
                    }
                    placeholder="Werbekonto suchen…"
                    className="max-w-xl"
                  >
                    <Label>Werbekonto (zahlt)</Label>
                    <Autocomplete.Trigger>
                      <Autocomplete.Value />
                      <Autocomplete.ClearButton />
                      <Autocomplete.Indicator />
                    </Autocomplete.Trigger>
                    <Autocomplete.Popover>
                      <Autocomplete.Filter filter={fuzzyCustomerMatch}>
                        <SearchField autoFocus name="ad-account-search" variant="secondary">
                          <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Werbekonten durchsuchen…" />
                            <SearchField.ClearButton />
                          </SearchField.Group>
                        </SearchField>
                        <ListBox
                          items={accounts}
                          renderEmptyState={() => <EmptyState>Kein Werbekonto gefunden</EmptyState>}
                        >
                          {(a: WizardAccount) => (
                            <ListBox.Item id={a.id} textValue={`${a.customerName} ${a.name}`}>
                              <span className="min-w-0">
                                <span className="block truncate">{a.name}</span>
                                <span className="text-ink-500 block truncate text-xs">
                                  {a.customerName}
                                </span>
                              </span>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          )}
                        </ListBox>
                      </Autocomplete.Filter>
                    </Autocomplete.Popover>
                    {prefill !== "none" && (
                      <Description aria-live="polite">
                        {prefill === "loading"
                          ? "Die letzte Kampagne dieses Kontos wird nach Standort und Radius durchsucht…"
                          : "Standort und Radius kommen aus der letzten Kampagne dieses Kontos."}
                      </Description>
                    )}
                  </Autocomplete>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          </div>
        )}

        {/* ------------------------------------------------ Schritt 2: Anzeigen */}
        {stepIndex === 1 && (
          <div className="space-y-4 p-6">
            {/* Ein Standort je Zeile, aufgeklappt nur der, an dem gearbeitet
                wird. Die Kopfzeile trägt, was sonst erst im Block steht:
                Adresse, Zahl der Anzeigen, offene Punkte. */}
            <DisclosureGroup
              expandedKeys={openSets}
              onExpandedChange={setOpenSets}
              allowsMultipleExpanded
              className="space-y-3"
            >
              {issues.perSet.map(({ set, blockers }, i) => (
                // Jeder Standort in einem eigenen Rahmen: aufgeklappt sind es
                // zwei Bildschirmhöhen Felder, und ohne Kante war nicht zu
                // sehen, wo der eine aufhört und der nächste anfängt.
                <Disclosure
                  key={set.id}
                  id={set.id}
                  className="border-line bg-surface rounded-2xl border px-4"
                >
                  <Disclosure.Heading>
                    <Disclosure.Trigger className="flex w-full items-center gap-3 py-3.5 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{set.name}</span>
                        <span className="text-ink-500 block truncate text-xs">
                          {locationSummary(set)}
                        </span>
                      </span>
                      <Chip size="sm" variant="soft" className="tabular-nums">
                        {plural(set.ads.length, "Anzeige", "Anzeigen")}
                      </Chip>
                      <IssueChip count={blockers.length} />
                      <Disclosure.Indicator />
                    </Disclosure.Trigger>
                  </Disclosure.Heading>
                  <Disclosure.Content>
                    <Disclosure.Body className="pb-4">
                      {/* Ohne Vorschau daneben: sie steht in der Überprüfung, wo
                          alle Standorte auf einmal zur Wahl stehen. Hier zählt
                          die Breite für die Felder. */}
                      <AdSetBlock
                        value={set}
                        pageId={client?.pageId ?? ""}
                        pageName={client?.pageName ?? ""}
                        instagramUserId={instagram?.id}
                        instagramLabel={instagramLabel}
                        adAccount={state.adAccount}
                        business={state.business}
                        roles={state.roles}
                        roleFreeText={state.roleFreeText}
                        blockers={blockers}
                        otherAdSets={state.adSets
                          .filter((other) => other.id !== set.id)
                          .map(({ id, name, ads }) => ({ id, name, ads }))}
                        borrowersOfAd={(adId) => borrowersOf(state.adSets, set.id, adId)}
                        onEditRoles={goToRoles}
                        onChange={(patch) => updateAdSet(i, patch)}
                        onRemove={() => removeAdSet(i)}
                        canRemove={state.adSets.length > 1}
                      />
                    </Disclosure.Body>
                  </Disclosure.Content>
                </Disclosure>
              ))}
            </DisclosureGroup>

            <Button variant="outline" onPress={addLocation}>
              Standort hinzufügen
            </Button>
          </div>
        )}

        {/* ------------------------------------------------ Schritt 3: Details */}
        {stepIndex === 2 && (
          <div className="space-y-8 p-6">
            {/* Der Name ist ein Ergebnis, keine Eingabe: er setzt sich aus Kunde,
                Rollen, Datum und Initialen zusammen. Deshalb steht er oben als
                Ergebnis, darunter das, was ihn füttert – das Feld erscheint nur,
                wenn jemand abweichen will. */}
            {/* Der Name ist ein Ergebnis, keine Eingabe. Er steht deshalb als
                Ergebnis oben – gerahmt wie ein Wert und nicht wie ein leeres
                Feld – und darunter nur das, was ihn ändert. */}
            <Fieldset>
              <Fieldset.Legend>Name der Kampagne</Fieldset.Legend>
              <Fieldset.Group>
                {editingName || state.nameEdited ? (
                  <TextField
                    value={state.campaignName}
                    onChange={(campaignNameValue) =>
                      setState((s) => ({
                        ...s,
                        campaignName: campaignNameValue,
                        nameEdited: true,
                      }))
                    }
                    isRequired
                    className="space-y-1.5"
                  >
                    <Label className="sr-only">Kampagnenname</Label>
                    <Input aria-label="Kampagnenname" />
                    <Description className="flex items-center justify-between gap-3">
                      Von Hand geändert — der Name folgt den Feldern unten nicht mehr.
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          setEditingName(false);
                          setState((s) => ({ ...s, nameEdited: false }));
                        }}
                      >
                        Automatisch benennen
                      </Button>
                    </Description>
                  </TextField>
                ) : (
                  <div className="border-line bg-surface-secondary flex items-center gap-3 rounded-xl border p-2 ps-3">
                    <Typography.Code className="min-w-0 flex-1 truncate bg-transparent p-0 text-sm">
                      {state.campaignName || "…"}
                    </Typography.Code>
                    <Button variant="outline" size="sm" onPress={() => setEditingName(true)}>
                      Anpassen
                    </Button>
                  </div>
                )}

                {/* Das Kürzel speist nur den Namen – es gehört hierher, nicht
                    zwischen Budget und Datum. Vorher standen Auswahl und Feld
                    unbeschriftet nebeneinander in einer Toolbar: zwei Kästen,
                    von denen keiner sagte, was er ist. */}
                {/* Gedeckelt: Ein Feld, in das zwei Buchstaben gehören, war über
                    die halbe Karte breit und sah aus, als fehle darin etwas. */}
                <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                  <Select
                    selectedKey={knownInitials.includes(state.initials) ? state.initials : null}
                    onSelectionChange={(key) => setState((s) => ({ ...s, initials: String(key) }))}
                    placeholder="Kürzel wählen…"
                    className="space-y-1.5"
                  >
                    <Label>Kürzel im Namen</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {knownInitials.map((i) => (
                          <ListBox.Item key={i} id={i} textValue={i}>
                            {i}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                    <Description>Steht am Ende des Namens.</Description>
                  </Select>
                  <TextField
                    value={state.initials}
                    onChange={(initials) => setState((s) => ({ ...s, initials }))}
                    className="space-y-1.5"
                  >
                    <Label>Anderes Kürzel</Label>
                    <Input placeholder="z. B. MW" />
                    <Description>Für alle, die noch in keiner Kampagne stehen.</Description>
                  </TextField>
                </div>
              </Fieldset.Group>
            </Fieldset>

            <Separator />

            {/* Eigener Abschnitt statt einer Zeile Kleingedrucktem über den
                Kästchen: die Rollen sind eine Frage für sich, auch wenn ihre
                Antwort im Namen landet. */}
            {/* Der Rahmen trägt nur den ref: hierher springt „Rollen wählen“
                aus dem Überschriften-Generator einen Schritt weiter vorn. */}
            <div ref={rolesRef} className="scroll-mt-24">
            <Fieldset>
              <Fieldset.Legend>Gesuchte Rollen</Fieldset.Legend>
              <Fieldset.Group>
                <CheckboxGroup
                  value={state.roles}
                  onChange={(roles) => setState((s) => ({ ...s, roles }))}
                  // HeroUI's .checkbox-group ist standardmäßig flex-col; flex-wrap
                  // allein ändert daran nichts (andere CSS-Eigenschaft) – ohne
                  // flex-row bleibt es eine lange einspaltige Liste.
                  className="flex flex-row flex-wrap gap-x-5 gap-y-2.5"
                  aria-label="Rollen"
                >
                  {ROLES.map((r) => (
                    // Control muss in Content verschachtelt sein, nicht daneben: Content
                    // rendert das <label>, das den (visuell versteckten) <input> enthält –
                    // nur was darin liegt, ist per Klick erreichbar. Als Geschwister blieb
                    // die Box tot und die Gruppe fiel in .checkbox' flex-col auseinander.
                    <Checkbox key={r.code} value={r.code}>
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        {r.label}
                      </Checkbox.Content>
                    </Checkbox>
                  ))}
                </CheckboxGroup>

                <TextField
                  value={state.roleFreeText}
                  onChange={(roleFreeText) => setState((s) => ({ ...s, roleFreeText }))}
                  className="max-w-sm space-y-1.5"
                >
                  <Label>Weitere Rolle</Label>
                  <Input placeholder="z. B. Koch" />
                  <Description>
                    Für Einzelfälle, die in kein Kürzel passen — landet unverändert im Namen.
                  </Description>
                </TextField>
              </Fieldset.Group>
            </Fieldset>
            </div>

            <Separator />

            <Fieldset>
              <Fieldset.Legend>Budget und Start</Fieldset.Legend>
              <Fieldset.Group className="grid max-w-3xl gap-4 sm:grid-cols-3 sm:space-y-0">
                <NumberField
                  value={state.dailyBudgetEuros}
                  onChange={(dailyBudgetEuros) => setState((s) => ({ ...s, dailyBudgetEuros }))}
                  minValue={1}
                  // Meta rechnet in Cent, also muss auch die Eingabe in Cent gehen.
                  // Mit step={1} rastete das Feld beim Verlassen auf ganze Euro ein
                  // und machte aus 30,05 wieder 30,00.
                  step={0.01}
                  formatOptions={{
                    style: "currency",
                    currency: "EUR",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }}
                  className="space-y-1.5"
                >
                  <Label>Tagesbudget</Label>
                  <NumberField.Group>
                    <NumberField.Input />
                  </NumberField.Group>
                  {/* Unter jedem der drei Felder steht eine Zeile, auch wo es
                      wenig zu sagen gibt: sonst stehen die Felder auf drei
                      verschiedenen Höhen und die Reihe franst aus. */}
                  <Description>Gilt für die ganze Kampagne.</Description>
                </NumberField>

                {/* Leer heißt "kein Limit", nicht "0 €" – NumberField drückt das
                    als NaN aus, der State als undefined. */}
                <NumberField
                  value={state.spendCapEuros ?? Number.NaN}
                  onChange={(v) =>
                    setState((s) => ({
                      ...s,
                      spendCapEuros: Number.isNaN(v) ? undefined : v,
                    }))
                  }
                  minValue={100}
                  step={0.01}
                  formatOptions={{
                    style: "currency",
                    currency: "EUR",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }}
                  className="space-y-1.5"
                >
                  <Label>Ausgabenlimit</Label>
                  <NumberField.Group>
                    <NumberField.Input />
                  </NumberField.Group>
                  <Description>Optional, mindestens 100 €.</Description>
                </NumberField>

                <DatePicker
                  value={toCalendarDate(state.startDate)}
                  onChange={(date) =>
                    date && setState((s) => ({ ...s, startDate: date.toString() }))
                  }
                  className="space-y-1.5"
                >
                  <Label>Startdatum</Label>
                  <DateField.Group fullWidth>
                    <DateField.Input>
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                    <DateField.Suffix>
                      <DatePicker.Trigger>
                        <DatePicker.TriggerIndicator />
                      </DatePicker.Trigger>
                    </DateField.Suffix>
                  </DateField.Group>
                  <DatePicker.Popover>
                    <Calendar aria-label="Startdatum">
                      <Calendar.Header>
                        <Calendar.YearPickerTrigger>
                          <Calendar.YearPickerTriggerHeading />
                          <Calendar.YearPickerTriggerIndicator />
                        </Calendar.YearPickerTrigger>
                        <Calendar.NavButton slot="previous" />
                        <Calendar.NavButton slot="next" />
                      </Calendar.Header>
                      <Calendar.Grid>
                        <Calendar.GridHeader>
                          {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                        </Calendar.GridHeader>
                        <Calendar.GridBody>
                          {(date) => <Calendar.Cell date={date} />}
                        </Calendar.GridBody>
                      </Calendar.Grid>
                      <Calendar.YearPickerGrid>
                        <Calendar.YearPickerGridBody>
                          {({ year }) => <Calendar.YearPickerCell year={year} />}
                        </Calendar.YearPickerGridBody>
                      </Calendar.YearPickerGrid>
                    </Calendar>
                  </DatePicker.Popover>
                </DatePicker>
              </Fieldset.Group>
            </Fieldset>

            <Disclosure>
              <Disclosure.Heading>
                {/* Derselbe Auslöser wie in Schritt 1: zwei Klappen, die
                    dasselbe tun, sollen auch gleich aussehen und gleich
                    aufgehen. Reduzierte Bewegung schaltet die Drehung aus. */}
                <Disclosure.Trigger className="group text-ink-700 flex w-full items-center gap-2 py-2 text-left text-sm font-medium">
                  Feste Einstellungen ansehen
                  <CaretRightIcon
                    aria-hidden
                    className="transition-transform duration-300 ease-out group-aria-expanded:rotate-90 motion-reduce:transition-none"
                    size={16}
                    weight="bold"
                  />
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className="space-y-2 pb-2">
                  <Facts rows={FIXED} />
                  <Description>
                    In v1 alles nur lesbar — das Tagesbudget oben ist der einzige editierbare Wert.
                  </Description>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          </div>
        )}

        {/* ------------------------------------------------ Schritt 4: Überprüfung */}
        {stepIndex === 3 && (
          <div className="space-y-4 p-6">
            <Card variant="secondary">
              <Card.Header>
                <Card.Title className="text-base">{state.campaignName || "—"}</Card.Title>
              </Card.Header>
              <Card.Content>
                <Facts
                  rows={[
                    ["Werbekonto (zahlt)", account?.name ?? "—"],
                    ["Kunde (beworben)", state.business || "—"],
                    ["Seite", client?.pageName ?? "—"],
                    ["Instagram", instagramLabel ?? "nur Facebook-Seite"],
                    ["Tagesbudget", money.format(state.dailyBudgetEuros)],
                    [
                      "Ausgabenlimit",
                      state.spendCapEuros !== undefined
                        ? money.format(state.spendCapEuros)
                        : "keins",
                    ],
                    ["Start", new Date(state.startDate).toLocaleDateString("de-DE")],
                    ["Anzeigen gesamt", String(state.adSets.reduce((n, s) => n + s.ads.length, 0))],
                  ]}
                />
              </Card.Content>
            </Card>

            {/* Ein Standort je Zeile, mit demselben Zähler wie in Schritt 2 –
                wer hier eine rote Zahl sieht, weiß, wohin er zurück muss. */}
            <ul className="space-y-2">
              {issues.perSet.map(({ set, blockers }) => (
                <li key={set.id}>
                  <Card variant="secondary">
                    <Card.Content className="flex flex-row items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{set.name}</span>
                        <span className="text-ink-500 block truncate text-xs">
                          {locationSummary(set)} · {plural(set.ads.length, "Anzeige", "Anzeigen")}
                        </span>
                      </span>
                      <IssueChip count={blockers.length} />
                    </Card.Content>
                  </Card>
                </li>
              ))}
            </ul>

            {/* Die Anzeige, wie sie später aussieht – erst hier, weil die Texte
                fertig sind. Bei mehreren Standorten eine Vorschau mit Auswahl
                statt einer Reihe untereinander: die Texte unterscheiden sich
                meist nur in einer Zeile. */}
            {previewSet && (
              <div className="space-y-2">
                {state.adSets.length > 1 && (
                  <Select
                    aria-label="Standort für die Vorschau"
                    selectedKey={previewSet.id}
                    onSelectionChange={(key) => setPreviewSetId(String(key))}
                    className="max-w-xs"
                  >
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox items={state.adSets}>
                        {(s: WizardAdSet) => (
                          <ListBox.Item id={s.id} textValue={s.name}>
                            {s.name}
                          </ListBox.Item>
                        )}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                )}
                <div className="max-w-sm">
                  <Preview
                    adSet={previewSet}
                    pageName={client?.pageName ?? ""}
                    adAccount={state.adAccount}
                  />
                </div>
              </div>
            )}

            {/* Was Meta ohnehin ablehnen würde – hier kostet es einen Klick, dort
                einen halb angelegten Kampagnenbaum. */}
            {blocked && (
              <Banner
                status="warning"
                title="Noch nicht bereit zum Erstellen"
                description={
                  <ul className="list-disc space-y-1 pl-5">
                    {allIssues.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                }
              />
            )}

            {overlaps.length > 0 && (
              <Banner
                status="warning"
                title="Zwei Anzeigengruppen am selben Ort"
                description={
                  <ul className="list-disc space-y-1 pl-5">
                    {overlaps.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                }
              />
            )}

            {progress && <LaunchProgressBar progress={progress} />}

            {submission && (
              <ReceiptPanel state={result} submission={submission} onRetry={submitWizard} />
            )}
          </div>
        )}

        {/* Ein Weiter-Knopf, immer an derselben Stelle – im letzten Schritt wird
            er zum Anlegen-Knopf. Vorher war die Hauptaktion je nach Schritt an
            einem anderen Ort oder gar nicht vorhanden. */}
        <Card.Footer className="border-line bg-surface-secondary justify-between gap-3 border-t px-6 py-4">
          <Button
            variant="outline"
            isDisabled={stepIndex === 0 || pending}
            onPress={() => setStep(String(stepIndex - 1))}
          >
            Zurück
          </Button>

          <div className="flex items-center gap-3">
            {stepIndex < STEPS.length - 1 ? (
              <>
                {stepIssues[stepIndex] > 0 && (
                  <Description>
                    {stepIssues[stepIndex] === 1
                      ? "1 offener Punkt — du kannst ihn später klären."
                      : `${stepIssues[stepIndex]} offene Punkte — du kannst sie später klären.`}
                  </Description>
                )}
                <Button isDisabled={locked} onPress={() => setStep(String(stepIndex + 1))}>
                  Weiter: {STEPS[stepIndex + 1]}
                </Button>
              </>
            ) : (
              <Button onPress={onCreate} isPending={pending} isDisabled={pending || blocked}>
                {pending ? "Wird erstellt…" : "Erstellen (pausiert)"}
              </Button>
            )}
          </div>
        </Card.Footer>
      </Card>
    </div>
  );
}
