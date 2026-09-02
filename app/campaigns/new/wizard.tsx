"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  Collapsible,
  CollapsibleGroup,
  Divider,
  Heading,
  List,
  ListItem,
  ProgressBar,
  Section,
  Selector,
  Text,
} from "@astryxdesign/core";
import { useRouter } from "next/navigation";
import { Sign } from "@/theme/icons";
import { campaignName } from "@/lib/naming";
import { label, plural } from "@/lib/labels";
import { duplicateLocations, locationSummary, placeTextValue } from "@/lib/geo";
import {
  DEFAULT_RADIUS_KM,
  adSetBlockers,
  applyBrief,
  borrowersOf,
  customerBlockers,
  detailBlockers,
  edited,
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
import { Infotafel } from "./angaben";
import { Auftrag, KundeWahl, fuzzySource, type ClientItem, type WizardClient } from "./auftrag";
import { Optional, VorschlagKopf, type AccountItem, type WizardAccount } from "./vorschlag";
import { Stepper } from "./stepper";
import { Preview } from "./preview";
import { ReceiptPanel } from "./receipt";
import {
  briefAction,
  closeBriefAction,
  leadgenTosAcceptedAction,
  prefillAction,
  refreshAssetsAction,
  type WizardSubmission,
} from "../actions";
import { useLaunch } from "./use-launch";
import { fuzzyCustomerMatch, instagramAccountLabel, resolveClientByName } from "@/lib/customers";
import type { LaunchProgress } from "@/lib/launch";
import type { Prefill } from "@/lib/prefill";

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

// Drei Schirme statt vier Schritte: der Auftrag wählt, der Vorschlag zeigt, was
// daraus wurde, das Anlegen legt an. Was früher „Anzeigen“ und „Details“ waren,
// steht jetzt auf einer Seite – die Details sind bis auf Rollen und Budget
// vorbelegt und stehen eingeklappt unter „Optionale Einstellungen“.
const STEPS = ["Auftrag", "Vorschlag", "Anlegen"];

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
 * Das Telefon rechts – im Vorschlag und im Anlegen dasselbe: es zeigt Texte und
 * Anzeigen, sobald es sie gibt. Bei mehreren Standorten eine Vorschau mit
 * Auswahl statt einer Reihe untereinander (die Texte unterscheiden sich meist
 * nur in einer Zeile). Klebt beim Rollen oben, damit die Anzeige neben jeder
 * Zeile sichtbar bleibt.
 */
function VorschauSpalte({
  adSets,
  adSet,
  onSelect,
  client,
  adAccount,
}: {
  adSets: WizardAdSet[];
  adSet: WizardAdSet;
  onSelect: (id: string) => void;
  client?: WizardClient;
  adAccount: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
      <Text type="large" weight="medium" as="h3">
        Vorschau
      </Text>
      {adSets.length > 1 && (
        <Selector
          label="Standort für die Vorschau"
          isLabelHidden
          options={adSets.map((s) => ({ value: s.id, label: s.name }))}
          value={adSet.id}
          onChange={onSelect}
          width="100%"
        />
      )}
      <Preview
        adSet={adSet}
        pageName={client?.pageName ?? ""}
        pageId={client?.pageId ?? ""}
        adAccount={adAccount}
      />
    </section>
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
 * Alle Schritte tragen denselben Innenabstand (24 px) und denselben Abstand
 * zwischen ihren Blöcken (24 px) – vorher waren es je nach Schritt 16, 24 oder
 * 32 px, und beim Weiterklicken verschob sich alles um ein paar Pixel.
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
      {/* Frage, Satz, Linie – in jedem Schritt dieselbe Kopfzeile. Der
          Haarstrich darunter macht aus der Frage einen Kopf statt des ersten
          Eintrags im Stapel: vorher stand sie im selben 24-px-Abstand zur
          ersten Eingabe wie jedes Feld zum nächsten, und ein Schritt las sich
          als eine lange Reihe gleichrangiger Blöcke. */}
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
  defaultAccount: string;
  defaultBusiness: string;
  initials: string;
  email: string;
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
  defaultAccount,
  defaultBusiness,
  initials,
  email,
}: WizardProps) {
  const { state, setState, loaded, restored, others, save, resume, remove, discard, forget } =
    useWizardState(initialState(defaultAccount, defaultBusiness, initials));
  // Kurz „Gespeichert“ zeigen, dann zurück – ein Knopf ohne Reaktion sieht
  // kaputt aus, ein Toast wäre für diese eine Bestätigung zu viel Apparat.
  const [justSaved, setJustSaved] = useState(false);
  const saveDraft = () => {
    save();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };
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
  // Welcher Standort in der Vorschau steht. Über die id, nicht den Index: wird
  // ein Standort davor entfernt, zeigte ein Index still auf einen anderen.
  // Fehlt die id, gilt der erste Standort.
  const [previewSetId, setPreviewSetId] = useState<string>();
  const { result, progress, pending, run } = useLaunch();
  // Für den Retry-Pfad im Receipt-Panel: das genaue Objekt, das gesendet wurde,
  // nicht der aktuelle (evtl. inzwischen weiterbearbeitete) Wizard-State.
  const [submission, setSubmission] = useState<WizardSubmission | null>(null);

  // Schirm 1 hat zwei Gesichter: die Aufgabenliste, solange kein Kunde
  // feststeht, und die Kundenwahl, sobald einer da ist oder jemand ohne
  // Aufgabe beginnt. `manual` merkt sich das Zweite.
  const [manual, setManual] = useState(false);
  const [picking, setPicking] = useState<string>();
  const [briefError, setBriefError] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);

  const pick = async (taskId: string) => {
    setPicking(taskId);
    setBriefError(undefined);
    // Die Aktion fängt selbst; hier bleibt nur die abgerissene Leitung – und
    // die darf den Schirm nicht sperren.
    const res = await briefAction(taskId).catch(
      (e: Error): Awaited<ReturnType<typeof briefAction>> => ({ error: e.message }),
    );
    setPicking(undefined);
    if (!res.brief) return setBriefError(res.error ?? "Der Auftrag konnte nicht gelesen werden.");
    const brief = res.brief;
    setWarnings(brief.warnings);
    // Der Kunde aus ClickUp heißt selten exakt wie die Meta-Seite. Exakt,
    // sonst der eine unscharfe Treffer, sonst bleibt der Name stehen und die
    // Kundenwahl zeigt ihn als nicht zugeordnet. Ohne Treffer bleibt die
    // Person auf dem Kundenfeld stehen, wo das Warnbanner das erklärt.
    const name = brief.clientName?.value ?? "";
    const exact = resolveClientByName(clients, name);
    const fuzzy = exact ? [] : clients.filter((c) => fuzzyCustomerMatch(c.name, name));
    const match = exact ?? (fuzzy.length === 1 ? fuzzy[0] : undefined);
    setState((s) => (match ? { ...applyBrief(s, brief), business: match.name } : applyBrief(s, brief)));
    setStep(match ? "1" : "0");
  };

  // Angelegt heißt fertig. Bliebe der Entwurf in der Liste, lüde er morgen
  // jemanden ein, dieselbe Kampagne ein zweites Mal anzulegen – und genau das
  // ist der Fehler, der bei Meta Geld kostet statt eine Fehlermeldung zu geben.
  // Auch bei teilweisem Erfolg: sobald eine campaignId existiert, steht sie.
  const campaignId = result.receipt?.campaignId;
  useEffect(() => {
    if (campaignId) forget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Angelegt heißt auch: Aufgabe weiter. Einmal je campaignId – forget() lässt
  // den State stehen, die taskId ist danach also noch da.
  const [clickup, setClickup] = useState<{ error?: string }>();
  const taskId = state.taskId;
  useEffect(() => {
    if (!campaignId || !taskId) return;
    closeBriefAction(taskId, state.campaignName, state.adAccount, campaignId).then(setClickup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const account = accounts.find((a) => a.id === state.adAccount);

  // Beide Suchfelder laufen über dieselbe unscharfe Suche wie vorher – Astryx
  // nimmt sie als SearchSource entgegen statt als filter-Prop. Werbekonten
  // werden zusätzlich über den Kundennamen gefunden – derselbe Suchtext wie
  // vorher, nur an anderer Stelle.
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
  // Der Name aus ClickUp, zu dem keine Meta-Seite gefunden wurde – die
  // Kundenwahl sagt das, statt den Namen still stehen zu lassen.
  const unmatched = state.business.trim() && !client ? state.business : undefined;

  // Die Annahme der Lead-Bedingungen passiert in Metas Oberfläche, in einem
  // anderen Tab (siehe LeadgenTosAlert) – dieser hier erfährt davon nur durch
  // Nachlesen. Solange die gewählte Seite blockt: bei Fokus (der Moment der
  // Rückkehr aus Metas Tab) und alle 30 s leadgen_tos_accepted der einen Seite
  // lesen. Erst wenn es stimmt, Portfolio-Cache wegwerfen und neu rendern –
  // dann kommt needsLeadgenTos als false herein und Meldung samt offenem
  // Punkt verschwinden von allein. needsLeadgenTos ist der einzige Blocker aus
  // Server-Daten; alle anderen sind lokaler Formularzustand, an dem Nachlesen
  // nichts ändert.
  const router = useRouter();
  // Ein Kunde entsteht im Business Manager (Seite dem System User zuweisen),
  // nicht hier. Der Knopf holt danach nur die Liste: ohne den Tag-Wurf hielte
  // der Portfolio-Cache die neue Seite bis zu 5 Minuten zurück.
  const [reloading, startReload] = useTransition();
  const reloadClients = () =>
    startReload(async () => {
      await refreshAssetsAction();
      router.refresh();
    });
  const needsTos = client?.needsLeadgenTos ?? false;
  const tosPageId = client?.pageId;
  useEffect(() => {
    if (!needsTos || !tosPageId) return;
    // Ein Graph-Aufruf je Tick, nicht das ganze Portfolio: Tag-Wurf und
    // router.refresh() erst, wenn die Annahme wirklich da ist – vorher warf
    // jeder Tick den 5-Minuten-Cache für alle weg.
    const check = async () => {
      if (!(await leadgenTosAcceptedAction(tosPageId))) return;
      await refreshAssetsAction();
      router.refresh();
    };
    const id = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
    };
  }, [needsTos, tosPageId, router]);

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
          sources: { ...s.sources, location: "previous" },
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
    setState((s) => {
      let ownAddress = false;
      const sets = s.adSets.map((set, idx) => {
        if (idx !== i) return set;
        const p = typeof patch === "function" ? patch(set) : patch;
        // Der Standort trägt sein Herkunftsetikett im Block – er liegt aber in
        // der Anzeigengruppe und nicht im State daneben, geht also nicht durch
        // `edited`. Dieselbe Regel von Hand: getippte Adresse, gefallenes
        // Etikett. Der Radius zählt nicht dazu, die Adresse bleibt ja die aus
        // dem Auftrag.
        if (idx === 0 && ("addressString" in p || "place" in p)) ownAddress = true;
        return { ...set, ...p };
      });
      const next = { ...s, adSets: syncLinkedAds(sets) };
      return ownAddress ? edited(next, "location", {}) : next;
    });

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
  // Nach Schirm sortiert, damit jeder Schirm seine eigenen Punkte trägt.
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

  // Der Vorschlag trägt beides: die Anzeigengruppen und die Felder darum.
  const stepIssues = [issues.customer.length, issues.adSets.length + issues.details.length, 0];
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
        // Aus dem Kunden, nicht aus dem Ad-Set-State: der wurde früher per
        // Mount-Effekt im Block befüllt – ein Standort, dessen Block nie
        // aufging, startete dann ohne Instagram-Konto und fiel erst bei Meta
        // durch („Wähle ein Instagram-Konto oder eine Facebook-Seite aus …“).
        instagramUserId: instagram?.id,
        ads: ads.map(toAdInput),
      })),
    });

  const stepIndex = Number(step);
  const previewSet = state.adSets.find((s) => s.id === previewSetId) ?? state.adSets[0];
  // Alles nach der Kundenwahl hängt am Kunden: die Seite trägt die Anzeigen,
  // sein Name baut den Kampagnennamen. Ohne ihn ist jeder weitere Schritt eine
  // Eingabe, die man später noch einmal machen darf.
  const locked = !client;
  // Solange kein Kunde feststeht und niemand ohne Aufgabe begonnen hat, steht
  // auf Schirm 1 die Aufgabenliste – in ihrer eigenen Karte unter dieser hier,
  // ohne Frage-Kopf und ohne Fußzeile: es gibt nichts zu speichern und nichts,
  // wohin man weiterginge.
  const showsList = stepIndex === 0 && !manual && !state.business && !state.taskId;

  // Der Satz neben der Hauptaktion. In den Schirmen davor hält nichts auf – ein
  // offener Punkt darf liegen bleiben, und genau das muss dastehen, sonst liest
  // sich der Zähler in der Leiste als Sperre. Im letzten Schirm hält er sehr
  // wohl auf: dort ist der Knopf tot, und der Grund dafür stand vorher nur oben
  // in der Meldung, außer Sichtweite vom Knopf.
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

      {/* Nur im ersten Schirm: dort beginnt man, und dort ist die Frage „an
          welchem hier arbeite ich weiter?“ noch offen. Danach ist sie
          beantwortet, und die Liste wäre nur noch eine Ablenkung. */}
      {stepIndex === 0 && (
        <Entwuerfe
          drafts={others}
          // Ein Entwurf mit Kunden ist über die Kundenwahl hinaus – er gehört in
          // den Vorschlag; einer ohne fiele dort auf einen gesperrten Schirm.
          onResume={(id) => {
            resume(id);
            if (others.find((d) => d.id === id)?.state.business) setStep("1");
          }}
          onRemove={remove}
        />
      )}

      {/* Die Karte legt ihre eigenen 16 px ab: Die Schrittleiste soll bis an
          beide Kanten reichen, und die Abschnitte darunter tragen mit 24 px
          mehr Rand, als eine Karte von sich aus gibt. */}
      <Card elevation="low" padding={0}>
        {/* Der Zähler steht am Schirm, nicht erst am Ende: sonst erfährt man
            vom fehlenden Formular nach acht Uploads. Gesperrt, solange kein
            Kunde gewählt ist – siehe `locked`. */}
        <Stepper
          steps={STEPS.map((label, i) => ({ label, issues: stepIssues[i] }))}
          current={stepIndex}
          onSelect={(i) => setStep(String(i))}
          lockedFrom={locked ? 1 : STEPS.length}
        />

        {/* ---------------------------------------------- Schirm 1: Auftrag */}
        {stepIndex === 0 && !showsList && (
          <Step
            frage="Für wen wird geworben?"
            satz="Die Facebook-Seite des Kunden trägt die Anzeigen und die Lead-Formulare, sein Name baut den Kampagnennamen."
          >
            <KundeWahl
              clientSource={clientSource}
              clientItem={clientItem}
              clientNameSource={state.sources.clientName}
              onChange={(item) =>
                setState((s) => edited(s, "clientName", { business: item?.auxiliaryData.name ?? "" }))
              }
              customerFieldRef={customerFieldRef}
              reloading={reloading}
              onReload={reloadClients}
              client={client}
              accountName={account?.name}
              instagramLabel={instagramLabel}
              unmatchedName={unmatched}
              // Nur mit Aufgabe im Rücken: wer ohne begonnen hat, hätte hier
              // keine andere zu wählen – nur einen Entwurf zu verlieren.
              onOtherTask={
                state.taskId
                  ? () => {
                      setManual(false);
                      discard();
                    }
                  : undefined
              }
            />
          </Step>
        )}

        {/* -------------------------------------------- Schirm 2: Vorschlag */}
        {stepIndex === 1 && (
          <Step
            frage="Passt der Vorschlag?"
            satz="Alles unten ist vorbelegt, wo es ging — Etiketten sagen, woher. Standort, Lead-Formular und Tagesbudget sind Pflicht; Dateien laden im Hintergrund weiter."
          >
            {/* Zwei Spalten, sobald Platz ist: links der Vorschlag, rechts das
                Telefon. Es zeigt Texte und Anzeigen, sobald es sie gibt. */}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <div className="flex min-w-0 flex-col gap-6">
                <VorschlagKopf state={state} setState={setState} warnings={warnings} />

                {/* Ein Standort je Zeile, aufgeklappt nur der, an dem gearbeitet
                    wird. Die Kopfzeile trägt, was sonst erst im Block steht:
                    Adresse, Zahl der Anzeigen, offene Punkte.
                    CollapsibleGroup rendert selbst kein DOM, solange es keine
                    Trennlinien zeichnet – der Abstand zwischen den Rahmen sitzt
                    deshalb an einem eigenen div. */}
                <CollapsibleGroup
                  type="multiple"
                  value={openSets}
                  onChange={onOpenSetsChange}
                  density="spacious"
                >
                  <div className="space-y-3">
                    {issues.perSet.map(({ set, blockers }, i) => (
                      // Jeder Standort in einem eigenen Rahmen: aufgeklappt sind
                      // es zwei Bildschirmhöhen Felder, und ohne Kante war nicht
                      // zu sehen, wo der eine aufhört und der nächste anfängt.
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
                                Bewertung – er sagt nur, wie viele Anzeigen im
                                Block stecken. Deshalb neutral. */}
                            <Badge
                              variant="neutral"
                              className="tabular-nums"
                              label={plural(set.ads.length, "Anzeige", "Anzeigen")}
                            />
                            <IssueChip count={blockers.length} />
                          </span>
                        }
                      >
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
                          benefits={state.benefits}
                          benefitsSource={state.sources.benefits}
                          onBenefitsChange={(benefits) =>
                            setState((s) => edited(s, "benefits", { benefits }))
                          }
                          // Texte entstehen beim Betreten – aber nur im ersten
                          // Standort: die weiteren leihen sich Anzeigen und
                          // Texte (syncLinkedAds).
                          autoGenerate={i === 0}
                          formHint={state.formHint}
                          driveFolderId={state.driveFolderId}
                          locationSource={i === 0 ? state.sources.location : undefined}
                          blockers={blockers}
                          otherAdSets={state.adSets
                            .filter((other) => other.id !== set.id)
                            .map(({ id, name, ads }) => ({ id, name, ads }))}
                          borrowersOfAd={(adId) => borrowersOf(state.adSets, set.id, adId)}
                          onChange={(patch) => updateAdSet(i, patch)}
                          onRemove={() => removeAdSet(i)}
                          canRemove={state.adSets.length > 1}
                        />
                      </Collapsible>
                    ))}
                  </div>
                </CollapsibleGroup>

                {/* Mit Zeichen: der Knopf steht unter einer Liste von
                    Aufklappern, die alle links ein Element tragen – ohne
                    eigenes Zeichen las er sich als deren Fuß statt als
                    Handlung. */}
                <Button
                  variant="secondary"
                  onClick={addLocation}
                  label="Standort hinzufügen"
                  icon={<Sign meaning="add" />}
                />

                <Divider />

                <Optional
                  state={state}
                  setState={setState}
                  accountSource={accountSource}
                  accountItem={accountItem}
                  prefill={prefill}
                  fixed={FIXED}
                />
              </div>

              {previewSet && (
                <VorschauSpalte
                  adSets={state.adSets}
                  adSet={previewSet}
                  onSelect={setPreviewSetId}
                  client={client}
                  adAccount={state.adAccount}
                />
              )}
            </div>
          </Step>
        )}

        {/* ---------------------------------------------- Schirm 3: Anlegen */}
        {stepIndex === 2 && (
          <Step
            frage="Passt alles?"
            satz="Kampagne, Anzeigengruppen und Anzeigen werden pausiert angelegt — es läuft nichts los und kostet nichts, bevor du sie bei Meta startest."
          >
            {/* Zwei Spalten, sobald Platz ist: links die Prüfliste, rechts das
                Telefon. Untereinander ließ die Vorschau die halbe Seite leer –
                und wer prüft, will Zahlen und Anzeige gleichzeitig sehen. */}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <div className="flex min-w-0 flex-col gap-6">
                {/* Ein Standort je Zeile, mit demselben Zähler wie im Vorschlag –
                    wer hier eine rote Zahl sieht, weiß, wohin er zurück muss.
                    Eine Liste mit Trennlinien statt einer Karte je Standort:
                    drei gleich große getönte Kästen untereinander sind ein
                    Raster, keine Aufzählung, und tragen jeweils einen Schatten,
                    den die Ein-Schritt-Regel der äußeren Karte schon vergeben
                    hat. */}
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

                {/* Was Meta ohnehin ablehnen würde – hier kostet es einen Klick,
                    dort einen halb angelegten Kampagnenbaum. */}
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

                {/* Die Aufgabe ist Teil des Ergebnisses, nicht des Formulars:
                    steht die Kampagne, wandert sie auf „Abnahme Kampagne“. Ein
                    Fehler dabei ist eine Zeile, kein Rückschritt. */}
                {clickup && (
                  <Banner
                    status={clickup.error ? "warning" : "success"}
                    title={
                      clickup.error
                        ? "ClickUp nicht aktualisiert"
                        : "ClickUp-Aufgabe auf „Abnahme Kampagne“"
                    }
                    description={
                      clickup.error ?? "Kommentar mit Name und Ads-Manager-Link steht an der Aufgabe."
                    }
                  />
                )}
              </div>

              {previewSet && (
                <VorschauSpalte
                  adSets={state.adSets}
                  adSet={previewSet}
                  onSelect={setPreviewSetId}
                  client={client}
                  adAccount={state.adAccount}
                />
              )}
            </div>
          </Step>
        )}

        {/* Ein Weiter-Knopf, immer an derselben Stelle – im letzten Schirm wird
            er zum Anlegen-Knopf. Vorher war die Hauptaktion je nach Schritt an
            einem anderen Ort oder gar nicht vorhanden.

            Astryx' Card hat keine Unterteile, die Fußzeile ist deshalb eine
            eigene Section: sie bringt die getönte Fläche und den Haarstrich
            oben aus dem Thema mit. `padding`/`paddingBlock` treffen dieselben
            24/16 px wie der Inhalt darüber, also fluchtet der Zurück-Knopf mit
            dem Text. */}
        {!showsList && (
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
                {/* Von Hand speichern, ohne auf die automatische Speicherung zu
                    warten – gerade vor dem Schließen des Tabs will man das sicher
                    wissen. aria-live sagt den Wechsel zu „Gespeichert“ an. */}
                <span aria-live="polite">
                  <Button
                    variant="ghost"
                    label={justSaved ? "Gespeichert ✓" : "Entwurf speichern"}
                    isDisabled={pending || justSaved}
                    onClick={saveDraft}
                  />
                </span>
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
        )}
      </Card>

      {/* Die Aufgabenliste steht in ihrer eigenen Karte unter der Schrittleiste:
          sie ist keine Eingabe in diesem Formular, sondern die Wahl davor. */}
      {showsList && (
        <>
          {briefError && (
            <Banner status="error" title="Auftrag nicht gelesen" description={briefError} />
          )}
          <Auftrag
            email={email}
            picking={picking}
            onPick={pick}
            onWithout={() => setManual(true)}
          />
        </>
      )}
    </div>
  );
}
