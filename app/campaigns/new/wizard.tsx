"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  CheckboxList,
  CheckboxListItem,
  Collapsible,
  CollapsibleGroup,
  DateInput,
  Divider,
  Heading,
  Kbd,
  NumberInput,
  ProgressBar,
  Selector,
  Text,
  TextInput,
  Typeahead,
  type ISODateString,
  type SearchSource,
  type SearchableItem,
} from "@astryxdesign/core";
import { UserPlusIcon } from "@phosphor-icons/react";
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
  const customerFieldRef = useRef<HTMLDivElement>(null);
  // ⇧K öffnet die Kundensuche von überall, außer jemand tippt gerade in ein
  // Feld. Der Shortcut steht direkt am Feld, damit er nicht entdeckt werden
  // muss. Geklickt wird der Rahmen des Typeahead (.astryx-typeahead ist dessen
  // stabiler Theming-Anker): daran hängt Astryx die Logik, die je nach Zustand
  // ins leere Feld fokussiert oder den schon gewählten Kunden zum Ändern
  // aufmacht. Das Eingabefeld selbst zu fokussieren träfe nur den ersten Fall –
  // bei gewähltem Kunden ist es auf Breite 0 zusammengeschoben.
  useEffect(() => {
    const openCustomerSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select") || target?.isContentEditable;
      if (isTyping || !event.shiftKey || event.key.toLocaleLowerCase("de") !== "k") return;
      event.preventDefault();
      customerFieldRef.current?.querySelector<HTMLElement>(".astryx-typeahead")?.click();
    };
    window.addEventListener("keydown", openCustomerSearch);
    return () => window.removeEventListener("keydown", openCustomerSearch);
  }, []);
  // Standorte starten zugeklappt: aufgeklappt ist ein Block zwei Bildschirm-
  // höhen hoch, und meistens wird nur an einem gearbeitet. Mehrere gleichzeitig
  // sind erlaubt – zum Vergleichen zweier Texte gibt es keinen anderen Weg
  // (CollapsibleGroup type="multiple").
  const [openSets, setOpenSets] = useState<string[]>([]);
  // CollapsibleGroup meldet den Wert je nach Modus als String oder String-Liste;
  // im multiple-Modus ist es immer die Liste, das Array bleibt der Normalfall.
  const onOpenSetsChange = (open: string | string[]) =>
    setOpenSets(Array.isArray(open) ? open : [open]);
  // Ein einzelner zugeklappter Standort sieht aus wie eine leere Seite. Die id
  // wechselt beim Wiederherstellen eines Entwurfs, deshalb am Wert hängend.
  const firstSetId = state.adSets[0]?.id;
  useEffect(() => {
    if (firstSetId) setOpenSets([firstSetId]);
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

  // Beide Suchfelder laufen über dieselbe unscharfe Suche wie vorher – Astryx
  // nimmt sie als SearchSource entgegen statt als filter-Prop. Werbekonten
  // werden zusätzlich über den Kundennamen gefunden – derselbe Suchtext wie
  // vorher, nur an anderer Stelle. maxMenuItems steht jeweils auf der Länge der
  // Liste: Astryx zeigt sonst nur zehn Einträge, und beide Listen gehen in die
  // Hunderte – wer ohne Tippen durchsehen will, sähe den Rest nicht.
  const clientItems = useMemo<ClientItem[]>(
    () => clients.map((c) => ({ id: c.id, label: c.name, auxiliaryData: c })),
    [clients],
  );
  const clientSource = useMemo(() => fuzzySource(clientItems), [clientItems]);
  const accountItems = useMemo<AccountItem[]>(
    () => accounts.map((a) => ({ id: a.id, label: a.name, auxiliaryData: a })),
    [accounts],
  );
  const accountSource = useMemo(
    () => fuzzySource(accountItems, (item) => `${item.auxiliaryData.customerName} ${item.label}`),
    [accountItems],
  );
  const accountItem = accountItems.find((item) => item.id === state.adAccount) ?? null;
  // Ein Feld, zwei Aufgaben: der getippte Kundenname baut den Kampagnennamen
  // und wählt zugleich die Seite, unter der Anzeigen und Formulare laufen.
  // Wer den Namen aus der Vorschlagsliste übernimmt, hat die Seite damit schon
  // gewählt – ohne einen zweiten Klick dafür.
  const client = resolveClientByName(clients, state.business);
  const clientItem = clientItems.find((item) => item.id === client?.id) ?? null;

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
      setOpenSets([fresh.id]);
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
            <Button variant="secondary" size="sm" onClick={discard} label="Neu beginnen" />
          }
        />
      )}

      {/* Die Karte legt ihre eigenen 16 px ab: Die Schrittleiste soll bis an
          beide Kanten reichen, und die Abschnitte darunter tragen mit 24 px
          mehr Rand, als eine Karte von sich aus gibt. */}
      <Card elevation="low" padding={0}>
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
          <div className="space-y-6 p-6 step-enter">
            {/* Ein Feld, zwei Wirkungen: die Seite des Kunden trägt Anzeigen und
                Lead-Formulare, sein Name baut den Kampagnennamen. Die Suche ist
                lokal und sofort; beim Laden der Meta-Liste deckt loading.tsx
                genau diese Fläche mit Skeletons ab. */}
            <div className="flex max-w-xl items-end gap-2">
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
                onChange={(item) =>
                  setState((s) => ({ ...s, business: item?.auxiliaryData.name ?? "" }))
                }
                hasEntriesOnFocus
                maxMenuItems={clientItems.length}
                debounceMs={0}
                emptySearchResultsText="Kein Kunde gefunden"
                ref={customerFieldRef}
                className="min-w-0 flex-1"
              />

              {/* Das Kürzel stand vorher im Feld, gleich neben dem Wert. Astryx'
                  Typeahead hat dafür keinen Platz (kein Slot am Feldende), also
                  steht es jetzt daneben – auf Höhe des Feldes und nicht neben
                  der Beschriftung, wo es zwischen Text und Pflicht-Stern saß. */}
              <span className="flex h-8 items-center">
                <Kbd keys="shift+k" />
              </span>

              {/* Absichtlich noch ohne Aktion: der Einstieg ist sichtbar, ohne
                  eine Kundenanlage vorzutäuschen, die es im Backend nicht gibt. */}
              <Button
                isIconOnly
                variant="secondary"
                label="Kunde hinzufügen"
                icon={<UserPlusIcon aria-hidden size={20} weight="bold" />}
              />
            </div>

            {client?.needsLeadgenTos && <LeadgenTosAlert client={client} />}

            {/* Wer zahlt, unter wessen Seite veröffentlicht wird und ob Instagram
                dabei ist, sind drei Antworten – vorher standen sie als ein Satz
                mit Mittelpunkt da und mussten gelesen statt überflogen werden. */}
            {client ? (
              <Card elevation="low" variant="muted" className="max-w-xl space-y-3">
                <Heading level={3}>Das steckt hinter dieser Wahl</Heading>
                <Facts
                  columns={1}
                  rows={[
                    ["Seite (veröffentlicht)", client.pageName],
                    ["Werbekonto (zahlt)", account?.name ?? "—"],
                    ["Instagram", instagramLabel ?? "nur Facebook-Seite"],
                  ]}
                />
              </Card>
            ) : (
              <Text type="supporting" as="p">
                Die weiteren Schritte öffnen sich, sobald ein Kunde gewählt ist — seine
                Facebook-Seite trägt die Anzeigen und Lead-Formulare.
              </Text>
            )}

            {/* Fast immer MedArbeiter; die Ausnahme liegt eine Ebene tiefer und
                hält so den üblichen Pfad kurz. Den Pfeil samt Drehung bringt
                Astryx' Collapsible selbst mit; die Bewegung ist über
                theme/motion.css global auf prefers-reduced-motion gestellt. */}
            <Collapsible defaultIsOpen={false} trigger="Erweiterte Einstellungen anzeigen">
              <div className="max-w-xl space-y-1.5 pb-2">
                <Typeahead
                  label="Werbekonto (zahlt)"
                  placeholder="Werbekonto suchen…"
                  searchSource={accountSource}
                  value={accountItem}
                  onChange={(item) => setState((s) => ({ ...s, adAccount: item?.id ?? "" }))}
                  hasEntriesOnFocus
                  maxMenuItems={accountItems.length}
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
                {/* Steht neben dem Feld statt in dessen description-Slot: der
                    Satz wechselt, während man hinschaut, und aria-live sagt
                    das an – ein description kann das nicht. */}
                {prefill !== "none" && (
                  <Text type="supporting" as="p" aria-live="polite">
                    {prefill === "loading"
                      ? "Die letzte Kampagne dieses Kontos wird nach Standort und Radius durchsucht…"
                      : "Standort und Radius kommen aus der letzten Kampagne dieses Kontos."}
                  </Text>
                )}
              </div>
            </Collapsible>
          </div>
        )}

        {/* ------------------------------------------------ Schritt 2: Anzeigen */}
        {stepIndex === 1 && (
          <div className="space-y-4 p-6 step-enter">
            {/* Ein Standort je Zeile, aufgeklappt nur der, an dem gearbeitet
                wird. Die Kopfzeile trägt, was sonst erst im Block steht:
                Adresse, Zahl der Anzeigen, offene Punkte. */}
            {/* CollapsibleGroup rendert selbst kein DOM, solange es keine
                Trennlinien zeichnet – der Abstand zwischen den Rahmen sitzt
                deshalb an einem eigenen div. */}
            <CollapsibleGroup
              type="multiple"
              value={openSets}
              onChange={onOpenSetsChange}
              // Ohne Trennlinien geben die Aufklapper sich sonst gar keine
              // Innenabstände; "spacious" trifft die 14 px, die die Kopfzeile
              // vorher von Hand trug.
              density="spacious"
            >
              <div className="space-y-3">
                {issues.perSet.map(({ set, blockers }, i) => (
                  // Jeder Standort in einem eigenen Rahmen: aufgeklappt sind es
                  // zwei Bildschirmhöhen Felder, und ohne Kante war nicht zu
                  // sehen, wo der eine aufhört und der nächste anfängt.
                  <Collapsible
                    key={set.id}
                    value={set.id}
                    className="border-line bg-surface collapsible-wide-trigger rounded-2xl border px-4"
                    trigger={
                      <span className="flex items-center gap-3 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{set.name}</span>
                          <span className="text-ink-500 block truncate text-xs font-normal">
                            {locationSummary(set)}
                          </span>
                        </span>
                        {/* Anders als IssueChip trägt dieser Zähler keine
                            Bewertung – er sagt nur, wie viele Anzeigen im Block
                            stecken. Deshalb neutral statt error/success. */}
                        <Badge
                          variant="neutral"
                          className="tabular-nums"
                          label={plural(set.ads.length, "Anzeige", "Anzeigen")}
                        />
                        <IssueChip count={blockers.length} />
                      </span>
                    }
                  >
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
                  </Collapsible>
                ))}
              </div>
            </CollapsibleGroup>

            <Button variant="secondary" onClick={addLocation} label="Standort hinzufügen" />
          </div>
        )}

        {/* ------------------------------------------------ Schritt 3: Details */}
        {stepIndex === 2 && (
          <div className="space-y-8 p-6 step-enter">
            {/* Der Name ist ein Ergebnis, keine Eingabe: er setzt sich aus Kunde,
                Rollen, Datum und Initialen zusammen. Deshalb steht er oben als
                Ergebnis, darunter das, was ihn füttert – das Feld erscheint nur,
                wenn jemand abweichen will. */}
            {/* Der Name ist ein Ergebnis, keine Eingabe. Er steht deshalb als
                Ergebnis oben – gerahmt wie ein Wert und nicht wie ein leeres
                Feld – und darunter nur das, was ihn ändert. */}
            <FieldsetSection legend="Name der Kampagne">
              {editingName || state.nameEdited ? (
                <div className="space-y-1.5">
                  <TextInput
                    label="Kampagnenname"
                    isLabelHidden
                    value={state.campaignName}
                    onChange={(campaignNameValue) =>
                      setState((s) => ({
                        ...s,
                        campaignName: campaignNameValue,
                        nameEdited: true,
                      }))
                    }
                    isRequired
                    description={NAME_EDITED_HINT}
                    width="100%"
                  />
                  {/* Der Hinweis steht doppelt: als `description` hängt er
                      über aria-describedby am Feld, wird bei isLabelHidden
                      aber mit versteckt (eine Astryx-Eigenheit, siehe
                      Task 10e). Sichtbar ist deshalb diese Zeile – und nur
                      hier passt der Knopf daneben, den ein `description`
                      (nur String) nicht tragen kann. */}
                  <div className="flex items-center justify-between gap-3">
                    <Text type="supporting">{NAME_EDITED_HINT}</Text>
                    <Button
                      variant="ghost"
                      size="sm"
                      label="Automatisch benennen"
                      onClick={() => {
                        setEditingName(false);
                        setState((s) => ({ ...s, nameEdited: false }));
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="border-line bg-surface-secondary flex items-center gap-3 rounded-xl border p-2 ps-3">
                  {/* Text type="code" statt der Astryx-Komponente `Code`:
                      die bringt eine eigene graue Fläche und Innenabstände
                      mit, die hier – im schon getönten Kasten – vorher
                      ausdrücklich weggenommen wurden (bg-transparent p-0),
                      und Astryx' CSS-Layer steht hinter Tailwinds
                      Utilities, ließe sich also nicht wegnehmen. */}
                  <Text type="code" className="min-w-0 flex-1 truncate">
                    {state.campaignName || "…"}
                  </Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    label="Anpassen"
                    onClick={() => setEditingName(true)}
                  />
                </div>
              )}

              {/* Das Kürzel speist nur den Namen – es gehört hierher, nicht
                  zwischen Budget und Datum. Vorher standen Auswahl und Feld
                  unbeschriftet nebeneinander in einer Toolbar: zwei Kästen,
                  von denen keiner sagte, was er ist. */}
              {/* Gedeckelt: Ein Feld, in das zwei Buchstaben gehören, war über
                  die halbe Karte breit und sah aus, als fehle darin etwas. */}
              <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                {/* Astryx' Selector nimmt Optionen als Daten statt als
                    ListBox-Kinder; blanke Strings sind ein gültiger
                    Optionstyp, also bleibt knownInitials, wie es ist. */}
                <Selector
                  label="Kürzel im Namen"
                  options={knownInitials}
                  value={knownInitials.includes(state.initials) ? state.initials : undefined}
                  onChange={(initials) => setState((s) => ({ ...s, initials }))}
                  placeholder="Kürzel wählen…"
                  description="Steht am Ende des Namens."
                  width="100%"
                />
                <TextInput
                  label="Anderes Kürzel"
                  value={state.initials}
                  onChange={(initials) => setState((s) => ({ ...s, initials }))}
                  placeholder="z. B. MW"
                  description="Für alle, die noch in keiner Kampagne stehen."
                  width="100%"
                />
              </div>
            </FieldsetSection>

            <Divider />

            {/* Eigener Abschnitt statt einer Zeile Kleingedrucktem über den
                Kästchen: die Rollen sind eine Frage für sich, auch wenn ihre
                Antwort im Namen landet. */}
            {/* Der Rahmen trägt nur den ref: hierher springt „Rollen wählen“
                aus dem Überschriften-Generator einen Schritt weiter vorn. */}
            <div ref={rolesRef} className="scroll-mt-24">
            <FieldsetSection legend="Gesuchte Rollen">
              {/* Astryx' CheckboxList legt die Einträge selbst an (als <ul>,
                  untereinander) – das vorher von Hand gesetzte flex-row-wrap
                  entfällt, sieben Rollen stehen jetzt in einer Spalte.
                  aria-label wird zu label + isLabelHidden: die sichtbare
                  Überschrift trägt schon die Legende des Abschnitts. */}
              <CheckboxList
                label="Rollen"
                isLabelHidden
                value={state.roles}
                onChange={(roles) => setState((s) => ({ ...s, roles }))}
              >
                {ROLES.map((r) => (
                  <CheckboxListItem key={r.code} value={r.code} label={r.label} />
                ))}
              </CheckboxList>

              <TextInput
                label="Weitere Rolle"
                value={state.roleFreeText}
                onChange={(roleFreeText) => setState((s) => ({ ...s, roleFreeText }))}
                placeholder="z. B. Koch"
                description="Für Einzelfälle, die in kein Kürzel passen — landet unverändert im Namen."
                className="max-w-sm"
                width="100%"
              />
            </FieldsetSection>
            </div>

            <Divider />

            <FieldsetSection
              legend="Budget und Start"
              groupClassName="grid max-w-3xl gap-4 sm:grid-cols-3"
            >
              {/* Unter jedem der drei Felder steht eine Zeile, auch wo es wenig
                  zu sagen gibt: sonst stehen die Felder auf drei verschiedenen
                  Höhen und die Reihe franst aus. */}
              <NumberInput
                label="Tagesbudget"
                value={state.dailyBudgetEuros}
                onChange={(dailyBudgetEuros) => setState((s) => ({ ...s, dailyBudgetEuros }))}
                min={1}
                // Meta rechnet in Cent, also muss auch die Eingabe in Cent gehen.
                // Mit step={1} rastete das Feld beim Verlassen auf ganze Euro ein
                // und machte aus 30,05 wieder 30,00.
                step={0.01}
                // Astryx' NumberInput kennt keine formatOptions – die Währung
                // steht als Einheit am Feld statt in der getippten Zahl
                // (dieselbe Lücke wie in row-controls.tsx, Task 10a).
                units="€"
                description="Gilt für die ganze Kampagne."
                width="100%"
              />

              {/* Leer heißt "kein Limit", nicht "0 €". Astryx drückt das über
                  hasClear aus: der Löschknopf setzt den Wert auf null, und null
                  wird hier zu undefined – dieselbe Bedeutung wie vorher NaN,
                  nur mit einem sichtbaren Weg dorthin. */}
              <NumberInput
                label="Ausgabenlimit"
                value={state.spendCapEuros ?? null}
                hasClear
                onChange={(v) => setState((s) => ({ ...s, spendCapEuros: v ?? undefined }))}
                min={100}
                step={0.01}
                units="€"
                description="Optional, mindestens 100 €."
                width="100%"
              />

              {/* Astryx bündelt Feld, Aufklapper und Kalender in einer
                  Komponente – aus DatePicker + DateField + Calendar samt
                  Kopfzeile, Navigation, Raster und Jahrwähler wird ein
                  DateInput. Gerechnet wird in ISO-Strings (yyyy-mm-dd), genau
                  dem Format, in dem das Startdatum ohnehin im State liegt. */}
              <DateInput
                label="Startdatum"
                value={toIsoDate(state.startDate)}
                onChange={(date) => date && setState((s) => ({ ...s, startDate: date }))}
                width="100%"
              />
            </FieldsetSection>

            {/* Derselbe Auslöser wie in Schritt 1: zwei Klappen, die dasselbe
                tun, sollen auch gleich aussehen und gleich aufgehen. Den Pfeil
                samt Drehung bringt Astryx' Collapsible jetzt selbst mit; die
                Bewegung ist über theme/motion.css global auf
                prefers-reduced-motion gestellt. */}
            <Collapsible defaultIsOpen={false} trigger="Feste Einstellungen ansehen">
              <div className="space-y-2 pb-2">
                <Facts rows={FIXED} />
                <Text type="supporting" as="p">
                  In v1 alles nur lesbar — das Tagesbudget oben ist der einzige editierbare Wert.
                </Text>
              </div>
            </Collapsible>
          </div>
        )}

        {/* ------------------------------------------------ Schritt 4: Überprüfung */}
        {stepIndex === 3 && (
          <div className="space-y-4 p-6 step-enter">
            {/* className="text-base" ist weggefallen: Astryx' Heading setzt
                seine Schriftgröße selbst, und Astryx' CSS-Layer steht hinter
                Tailwinds Utilities – die Klasse wäre wirkungslos gewesen.
                Ebene 3 ist die Kartentitelgröße dieses Hauses. */}
            <Card elevation="low" variant="muted" className="space-y-3">
              <Heading level={3}>{state.campaignName || "—"}</Heading>
              <Facts
                rows={[
                  ["Werbekonto (zahlt)", account?.name ?? "—"],
                  ["Kunde (beworben)", state.business || "—"],
                  ["Seite", client?.pageName ?? "—"],
                  ["Instagram", instagramLabel ?? "nur Facebook-Seite"],
                  ["Tagesbudget", money.format(state.dailyBudgetEuros)],
                  [
                    "Ausgabenlimit",
                    state.spendCapEuros !== undefined ? money.format(state.spendCapEuros) : "keins",
                  ],
                  ["Start", new Date(state.startDate).toLocaleDateString("de-DE")],
                  ["Anzeigen gesamt", String(state.adSets.reduce((n, s) => n + s.ads.length, 0))],
                ]}
              />
            </Card>

            {/* Ein Standort je Zeile, mit demselben Zähler wie in Schritt 2 –
                wer hier eine rote Zahl sieht, weiß, wohin er zurück muss. */}
            <ul className="space-y-2">
              {issues.perSet.map(({ set, blockers }) => (
                <li key={set.id}>
                  <Card elevation="low" variant="muted" className="flex flex-row items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{set.name}</span>
                      <span className="text-ink-500 block truncate text-xs">
                        {locationSummary(set)} · {plural(set.ads.length, "Anzeige", "Anzeigen")}
                      </span>
                    </span>
                    <IssueChip count={blockers.length} />
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
                  <Selector
                    label="Standort für die Vorschau"
                    isLabelHidden
                    options={state.adSets.map((s) => ({ value: s.id, label: s.name }))}
                    value={previewSet.id}
                    onChange={setPreviewSetId}
                    className="max-w-xs"
                    width="100%"
                  />
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
        {/* Astryx' Card hat keine Unterteile – die Fußzeile ist deshalb ein
            eigenes div und trägt ihr flex selbst, das vorher von
            Card.Footer kam. */}
        <div className="border-line bg-surface-secondary flex items-center justify-between gap-3 border-t px-6 py-4">
          <Button
            variant="secondary"
            label="Zurück"
            isDisabled={stepIndex === 0 || pending}
            onClick={() => setStep(String(stepIndex - 1))}
          />

          <div className="flex items-center gap-3">
            {stepIndex < STEPS.length - 1 ? (
              <>
                {stepIssues[stepIndex] > 0 && (
                  <Text type="supporting">
                    {stepIssues[stepIndex] === 1
                      ? "1 offener Punkt — du kannst ihn später klären."
                      : `${stepIssues[stepIndex]} offene Punkte — du kannst sie später klären.`}
                  </Text>
                )}
                <Button
                  isDisabled={locked}
                  label={`Weiter: ${STEPS[stepIndex + 1]}`}
                  onClick={() => setStep(String(stepIndex + 1))}
                />
              </>
            ) : (
              <Button
                onClick={onCreate}
                isLoading={pending}
                isDisabled={pending || blocked}
                label={pending ? "Wird erstellt…" : "Erstellen (pausiert)"}
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

type ClientItem = SearchableItem<WizardClient> & { auxiliaryData: WizardClient };
type AccountItem = SearchableItem<WizardAccount> & { auxiliaryData: WizardAccount };

/**
 * Astryx' Typeahead filtert über eine SearchSource, nicht über einen
 * filter-Prop. fuzzyCustomerMatch bleibt damit erhalten – getippte Kürzel wie
 * „hkps“ finden „Häusliche Krankenpflege Schölzke“, was ein reiner
 * Teilstring-Vergleich (Astryx' eingebaute Suche) nicht täte. Die Listen liegen
 * fertig im Browser, also ist die Suche synchron und ohne Verzögerung.
 */
function fuzzySource<T extends SearchableItem>(
  items: T[],
  textOf: (item: T) => string = (item) => item.label,
): SearchSource<T> {
  return {
    bootstrap: () => items,
    search: (query) =>
      query ? items.filter((item) => fuzzyCustomerMatch(textOf(item), query)) : items,
  };
}

// Astryx' DateInput rechnet in ISO-Strings statt in CalendarDate. Die
// Absicherung gegen einen kaputten sessionStorage-Eintrag bleibt bei
// toCalendarDate; CalendarDate.toString() liefert immer yyyy-mm-dd, was
// TypeScript einem string nicht ansieht – daher die eine Zusicherung hier.
const toIsoDate = (iso: string) => toCalendarDate(iso).toString() as ISODateString;

// Steht zweimal im Baum – einmal sichtbar, einmal als `description` fürs
// Vorlesen. Eine Konstante, damit die beiden nie auseinanderlaufen.
const NAME_EDITED_HINT = "Von Hand geändert — der Name folgt den Feldern unten nicht mehr.";

/**
 * Astryx kennt kein Fieldset. Ein Abschnitt mit Beschriftung ist deshalb
 * natives <fieldset>/<legend> plus Astryx-Typografie – dieselbe Lösung wie in
 * ad-set-block.tsx. Tailwinds Preflight räumt die Browser-Chrome (Rahmen,
 * Einkerbung) schon weg, ein CSS-Override braucht es nicht.
 *
 * `groupClassName` sitzt am inneren div, das den Platz von Fieldset.Group
 * einnimmt: die Felder darin stehen je nach Abschnitt untereinander oder
 * nebeneinander im Raster.
 */
function FieldsetSection({
  legend,
  groupClassName = "space-y-4",
  children,
}: {
  legend: ReactNode;
  groupClassName?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="w-full">
        <Text type="large" weight="medium" as="span">
          {legend}
        </Text>
      </legend>
      <div className={groupClassName}>{children}</div>
    </fieldset>
  );
}
