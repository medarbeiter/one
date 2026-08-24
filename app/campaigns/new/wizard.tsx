"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  Collapsible,
  CollapsibleGroup,
  DateInput,
  Divider,
  Heading,
  Kbd,
  List,
  ListItem,
  MultiSelector,
  NumberInput,
  ProgressBar,
  Section,
  Selector,
  Text,
  TextInput,
  Typeahead,
  type ISODateString,
  type SearchSource,
  type SearchableItem,
} from "@astryxdesign/core";
import { UserPlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Sign } from "@/theme/icons";
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
import { Entwuerfe } from "./entwuerfe";
import { AdSetBlock } from "./ad-set-block";
import { Angaben, Infotafel } from "./angaben";
import { Stepper } from "./stepper";
import { Preview } from "./preview";
import { ReceiptPanel } from "./receipt";
import { prefillAction, refreshAssetsAction, type WizardSubmission } from "../actions";
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
 * Der Rahmen jedes Schritts: eine Frage, ein Satz, dann die Felder.
 *
 * Vorher fing jeder Schritt unmittelbar mit einem Eingabefeld an. Wie er heißt,
 * stand in der Leiste darüber – *was er entscheidet* nirgends, das war aus den
 * Feldern zu erschließen. Die Überschrift wiederholt den Namen deshalb nicht,
 * sondern stellt die Frage, die der Schritt beantwortet; der Satz darunter sagt,
 * was an der Antwort hängt.
 *
 * Alle vier Schritte tragen denselben Innenabstand (24 px) und denselben
 * Abstand zwischen ihren Blöcken (24 px) – vorher waren es je nach Schritt 16,
 * 24 oder 32 px, und beim Weiterklicken verschob sich alles um ein paar Pixel.
 */
function Step({
  frage,
  satz,
  children,
}: {
  frage: string;
  satz: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="step-enter flex flex-col gap-6 p-6">
      {/* Frage, Satz, Linie – in jedem der vier Schritte dieselbe Kopfzeile.
          Der Haarstrich darunter macht aus der Frage einen Kopf statt des
          ersten Eintrags im Stapel: vorher stand sie im selben 24-px-Abstand
          zur ersten Eingabe wie jedes Feld zum nächsten, und ein Schritt las
          sich als eine lange Reihe gleichrangiger Blöcke. */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Heading level={2}>{frage}</Heading>
          {/* Auf Textbreite gedeckelt: über die volle Karte gezogen bräuchte
              dieser eine Satz zwei Sprünge des Auges statt eines. */}
          <Text type="supporting" color="secondary" as="p" className="max-w-prose">
            {satz}
          </Text>
        </div>
        <Divider />
      </header>
      {children}
    </div>
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
  const { state, setState, loaded, restored, others, resume, remove, discard, forget } =
    useWizardState(initialState(defaultAccount, defaultBusiness));
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
    // Der Auslöser der Rollenauswahl ist seit dem MultiSelector ein
    // role="combobox"-Knopf und kein Kästchen-<input> mehr; die Liste steht
    // erst nach dem Aufklappen im DOM.
    rolesRef.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [rolesWanted, step]);
  const { result, progress, pending, run } = useLaunch();
  // Für den Retry-Pfad im Receipt-Panel: das genaue Objekt, das gesendet wurde,
  // nicht der aktuelle (evtl. inzwischen weiterbearbeitete) Wizard-State.
  const [submission, setSubmission] = useState<WizardSubmission | null>(null);

  // Angelegt heißt fertig. Bliebe der Entwurf in der Liste, lüde er morgen
  // jemanden ein, dieselbe Kampagne ein zweites Mal anzulegen – und genau das
  // ist der Fehler, der bei Meta Geld kostet statt eine Fehlermeldung zu geben.
  // Auch bei teilweisem Erfolg: sobald eine campaignId existiert, steht sie.
  const campaignId = result.receipt?.campaignId;
  useEffect(() => {
    if (campaignId) forget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

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

  // Die Annahme der Lead-Bedingungen passiert in Metas Oberfläche, in einem
  // anderen Tab (siehe LeadgenTosAlert) – dieser hier erfährt davon nur durch
  // Nachlesen. Solange die gewählte Seite blockt: bei Fokus (der Moment der
  // Rückkehr aus Metas Tab) und alle 30 s den Portfolio-Cache wegwerfen und neu
  // rendern. Sobald leadgen_tos_accepted stimmt, kommt needsLeadgenTos als
  // false herein und Meldung samt offenem Punkt verschwinden von allein.
  // needsLeadgenTos ist der einzige Blocker aus Server-Daten; alle anderen sind
  // lokaler Formularzustand, an dem Nachlesen nichts ändert.
  const router = useRouter();
  const needsTos = client?.needsLeadgenTos ?? false;
  useEffect(() => {
    if (!needsTos) return;
    const check = () => refreshAssetsAction().then(() => router.refresh());
    // ponytail: 30 s festes Intervall gegen Metas Graph – Backoff erst, falls
    // Rate-Limits real werden.
    const id = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
    };
  }, [needsTos, router]);

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

  // Der Satz neben der Hauptaktion. In den ersten drei Schritten hält nichts
  // auf – ein offener Punkt darf liegen bleiben, und genau das muss dastehen,
  // sonst liest sich der Zähler in der Leiste als Sperre. Im letzten Schritt
  // hält er sehr wohl auf: dort ist der Knopf tot, und der Grund dafür stand
  // vorher nur oben in der Meldung, außer Sichtweite vom Knopf.
  const lastStep = stepIndex === STEPS.length - 1;
  const offen = lastStep ? allIssues.length : stepIssues[stepIndex];
  const fussHinweis =
    pending || offen === 0
      ? undefined
      : lastStep
        ? `${offen === 1 ? "1 offener Punkt" : `${offen} offene Punkte`} — nachzulesen oben.`
        : offen === 1
          ? "1 offener Punkt — du kannst ihn später klären."
          : `${offen} offene Punkte — du kannst sie später klären.`;

  return (
    <div className="space-y-4">
      {/* Ein wiederhergestellter Entwurf sieht aus wie ein frisch ausgefüllter –
          ohne diesen Hinweis baut jemand auf den Zahlen von gestern weiter. */}
      {restored && (
        <Banner
          status="warning"
          title="Entwurf wiederhergestellt"
          description="Die Eingaben stammen aus einer früheren Sitzung."
          endContent={
            <Button variant="secondary" size="sm" onClick={discard} label="Neu beginnen" />
          }
        />
      )}

      {/* Nur im ersten Schritt: dort beginnt man, und dort ist die Frage „an
          welchem hier arbeite ich weiter?“ noch offen. Ab Schritt 2 ist sie
          beantwortet, und die Liste wäre nur noch eine Ablenkung. */}
      {stepIndex === 0 && <Entwuerfe drafts={others} onResume={resume} onRemove={remove} />}

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
          <Step
            frage="Für wen wird geworben?"
            satz="Die Facebook-Seite des Kunden trägt die Anzeigen und die Lead-Formulare, sein Name baut den Kampagnennamen. Alle weiteren Schritte hängen daran."
          >
            {/* Ein Feld, zwei Wirkungen: die Seite des Kunden trägt Anzeigen und
                Lead-Formulare, sein Name baut den Kampagnennamen. Die Suche ist
                lokal und sofort; beim Laden der Meta-Liste deckt loading.tsx
                genau diese Fläche mit Skeletons ab. */}
            <div className="flex max-w-xl flex-col gap-2">
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

                {/* Absichtlich noch ohne Aktion: der Einstieg ist sichtbar, ohne
                    eine Kundenanlage vorzutäuschen, die es im Backend nicht gibt. */}
                <Button
                  isIconOnly
                  variant="secondary"
                  label="Kunde hinzufügen"
                  icon={<UserPlusIcon aria-hidden size={20} weight="bold" />}
                />
              </div>

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
              <div className="max-w-xl">
                <Angaben
                  titel="Das steckt hinter dieser Wahl"
                  rows={[
                    ["Seite (veröffentlicht)", client.pageName],
                    ["Werbekonto (zahlt)", account?.name ?? "—"],
                    ["Instagram", instagramLabel ?? "nur Facebook-Seite"],
                  ]}
                />
              </div>
            )}

            <Divider />

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
          </Step>
        )}

        {/* ------------------------------------------------ Schritt 2: Anzeigen */}
        {stepIndex === 1 && (
          <Step
            frage="Was wird gezeigt — und wo?"
            satz="Je Standort eine Anzeigengruppe. Dateien laden im Hintergrund weiter hoch: du kannst schon weiterklicken, während sie laufen."
          >
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

            {/* Mit Zeichen: der Knopf steht unter einer Liste von Aufklappern,
                die alle links ein Element tragen – ohne eigenes Zeichen las er
                sich als deren Fuß statt als Handlung. */}
            <Button
              variant="secondary"
              onClick={addLocation}
              label="Standort hinzufügen"
              icon={<Sign meaning="add" />}
            />
          </Step>
        )}

        {/* ------------------------------------------------ Schritt 3: Details */}
        {stepIndex === 2 && (
          <Step
            frage="Wie heißt sie, was darf sie kosten?"
            satz="Der Name baut sich aus Kunde, Rollen, Startdatum und Kürzel — von Hand geht auch. Alles Übrige liegt fest und steht unten zum Nachlesen."
          >
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
              <FieldsetSection
                legend="Gesuchte Rollen"
                groupClassName="grid max-w-3xl gap-4 sm:grid-cols-2"
              >
                {/* Eine Liste aus Kästchen statt eines Aufklappers hieß: jede
                    neue Rolle macht den Schritt länger, und schon die sieben
                    von heute stehen als Spalte quer durch das Formular. Der
                    Bestand wächst weiter – Astryx' MultiSelector hält ihn
                    hinter einem Feld von der Höhe der anderen. Die Auswahl
                    bleibt trotzdem lesbar: `badges` zeigt die gewählten Rollen
                    im Auslöser, statt nur „3 ausgewählt" zu melden.
                    hasSearch erst ab ~15 Einträgen (Astryx' Regel) – bis dahin
                    ist die Liste kürzer als das Suchfeld darüber. */}
                <MultiSelector
                  label="Rollen"
                  isLabelHidden
                  options={ROLES.map((r) => ({ value: r.code, label: r.label }))}
                  value={state.roles}
                  onChange={(roles) => setState((s) => ({ ...s, roles }))}
                  placeholder="Rollen wählen…"
                  triggerDisplay="badges"
                  hasSearch={ROLES.length > 15}
                  searchPlaceholder="Rolle suchen…"
                  description="Mehrere möglich — die Kürzel landen im Namen."
                  width="100%"
                />

                <TextInput
                  label="Weitere Rolle"
                  value={state.roleFreeText}
                  onChange={(roleFreeText) => setState((s) => ({ ...s, roleFreeText }))}
                  placeholder="z. B. Koch"
                  description="Für Einzelfälle ohne Kürzel — steht unverändert im Namen."
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
                // Ohne diese Zeile stand das Feld als einziges der drei ohne
                // Beschreibung da – und damit sein Eingabekasten eine Zeile
                // höher als die beiden daneben. Sie sagt zugleich das
                // Einzige, was das Datum wirklich tut: es steht im Namen
                // („… ab 21.08.26 …", siehe lib/naming.ts) und wird nicht an
                // Meta geschickt, die Kampagne entsteht ohnehin pausiert.
                description="Steht im Kampagnennamen."
                width="100%"
              />
            </FieldsetSection>

            {/* Derselbe Auslöser wie in Schritt 1: zwei Klappen, die dasselbe
                tun, sollen auch gleich aussehen und gleich aufgehen. Den Pfeil
                samt Drehung bringt Astryx' Collapsible jetzt selbst mit; die
                Bewegung ist über theme/motion.css global auf
                prefers-reduced-motion gestellt. */}
            <Collapsible defaultIsOpen={false} trigger="Feste Einstellungen ansehen">
              <div className="flex max-w-xl flex-col gap-3 pb-2">
                <Angaben rows={FIXED} />
                <Text type="supporting" as="p">
                  In v1 alles nur lesbar — das Tagesbudget oben ist der einzige editierbare Wert.
                </Text>
              </div>
            </Collapsible>
          </Step>
        )}

        {/* ------------------------------------------------ Schritt 4: Überprüfung */}
        {stepIndex === 3 && (
          <Step
            frage="Passt alles?"
            satz="Kampagne, Anzeigengruppen und Anzeigen werden pausiert angelegt — es läuft nichts los und kostet nichts, bevor du sie bei Meta startest."
          >
            {/* Der Kampagnenname ist der Titel dieser Tafel und nicht eine Zeile
                darin: er ist das, was gleich bei Meta stehen wird. */}
            <Angaben
              titel={state.campaignName || "—"}
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

            {/* Ein Standort je Zeile, mit demselben Zähler wie in Schritt 2 –
                wer hier eine rote Zahl sieht, weiß, wohin er zurück muss.
                Eine Liste mit Trennlinien statt einer Karte je Standort: drei
                gleich große getönte Kästen untereinander sind ein Raster, keine
                Aufzählung, und tragen jeweils einen Schatten, den die
                Ein-Schritt-Regel der äußeren Karte schon vergeben hat. */}
            <Infotafel titel={plural(state.adSets.length, "Standort", "Standorte")}>
              <List hasDividers density="spacious">
                {issues.perSet.map(({ set, blockers }) => (
                  <ListItem
                    key={set.id}
                    label={set.name}
                    description={`${locationSummary(set)} · ${plural(set.ads.length, "Anzeige", "Anzeigen")}`}
                    endContent={<IssueChip count={blockers.length} />}
                  />
                ))}
              </List>
            </Infotafel>

            {/* Die Anzeige, wie sie später aussieht – erst hier, weil die Texte
                fertig sind. Bei mehreren Standorten eine Vorschau mit Auswahl
                statt einer Reihe untereinander: die Texte unterscheiden sich
                meist nur in einer Zeile. Mit Überschrift: ohne sie stand das
                Telefonbild ohne ein Wort dazu zwischen zwei Aufzählungen und
                sah aus wie eine schon angelegte Anzeige. */}
            {previewSet && (
              <section className="flex flex-col gap-3">
                <Text type="large" weight="medium" as="h3">
                  Vorschau
                </Text>
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
              </section>
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
          </Step>
        )}

        {/* Ein Weiter-Knopf, immer an derselben Stelle – im letzten Schritt wird
            er zum Anlegen-Knopf. Vorher war die Hauptaktion je nach Schritt an
            einem anderen Ort oder gar nicht vorhanden.

            Astryx' Card hat keine Unterteile, die Fußzeile ist deshalb eine
            eigene Section: sie bringt die getönte Fläche und den Haarstrich
            oben aus dem Thema mit. Vorher standen dafür `bg-surface-secondary`
            und `border-t` im Markup – für die getönte Fläche gab es aber kein
            Token, der Streifen war also unsichtbar und die Fußzeile hing weiß
            an weiß unter dem letzten Feld. `padding`/`paddingBlock` treffen
            dieselben 24/16 px wie vorher, also fluchtet der Zurück-Knopf
            weiter mit dem Text darüber. */}
        <Section variant="muted" padding={6} paddingBlock={4} dividers={["top"]}>
          {/* Umbrechend statt starr nebeneinander: auf dem Telefon rutscht der
              Hinweis über die Knöpfe, statt den Weiter-Knopf zu zerdrücken. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              label="Zurück"
              icon={<Sign meaning="previous" />}
              isDisabled={stepIndex === 0 || pending}
              onClick={() => setStep(String(stepIndex - 1))}
            />

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
              {/* aria-live: der Satz wechselt, während man in einem Feld tippt –
                  wer nicht hinsieht, erführe die Änderung sonst nicht. */}
              {fussHinweis && (
                <Text type="supporting" as="span" className="text-right" aria-live="polite">
                  {fussHinweis}
                </Text>
              )}
              {stepIndex < STEPS.length - 1 ? (
                <Button
                  isDisabled={locked}
                  label={`Weiter: ${STEPS[stepIndex + 1]}`}
                  endContent={<Sign meaning="next" />}
                  onClick={() => setStep(String(stepIndex + 1))}
                />
              ) : (
                <Button
                  onClick={onCreate}
                  isLoading={pending}
                  isDisabled={pending || blocked}
                  icon={pending ? undefined : <Sign meaning="launch" />}
                  label={pending ? "Wird erstellt…" : "Erstellen (pausiert)"}
                />
              )}
            </div>
          </div>
        </Section>
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
