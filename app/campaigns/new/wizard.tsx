"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  AlertDialog,
  Badge,
  Banner,
  Button,
  Collapsible,
  CollapsibleGroup,
  DropdownMenu,
  Heading,
  Link,
  List,
  ListItem,
  ProgressBar,
  Section,
  Selector,
  Text,
} from "@astryxdesign/core";
import { useRouter } from "next/navigation";
import { Sign } from "@/theme/icons";
import { adsManagerUrl, label, plural } from "@/lib/labels";
import { duplicateLocations, locationSummary } from "@/lib/geo";
import {
  DEFAULT_RADIUS_KM,
  adSetBlockers,
  applyBrief,
  cityOf,
  borrowersOf,
  customerBlockers,
  detailBlockers,
  queuedLaunch,
  edited,
  emptyAdSet,
  initialState,
  stateFromSeed,
  syncLinkedAds,
  textInstructions,
  toAdInput,
  useWizardState,
  withArrivedAssets,
  duplicateAdSet,
  firstScreen,
  reapplyBrief,
  type WizardAdSet,
  type WizardState,
} from "./state";
import { useCampaignNameSync, useClickupCloseout, useLeadgenTos, usePrefill } from "./wizard-hooks";
import { GhlHinweis } from "./ghl-hinweis";
import { drainArrived, uploadStatus, useUploadVersion } from "./upload-queue";
import { Entwuerfe } from "./entwuerfe";
import { AdSetBlock } from "./ad-set-block";
import { Infotafel } from "./angaben";
import { Auftrag, KundeWahl, fuzzySource, type ClientItem, type WizardClient } from "./auftrag";
import { Optional, VorschlagKopf, type AccountItem, type WizardAccount } from "./vorschlag";
import { Stepper } from "./stepper";
import form from "./campaign-form.module.css";
import { Preview } from "./preview";
import { ReceiptPanel } from "./receipt";
import { activitySnapshot, clearActivity, report, useActivity } from "./activity";
import { Werkstattleiste, announceBriefPlan, reportBriefEvent } from "./werkstatt";
import type { BriefStreamEvent } from "@/app/api/brief/route";
import type { AssembledBrief } from "@/lib/brief";
import type { CampaignSeed } from "@/lib/seed";
import { readNdjson } from "@/lib/ndjson";
import { campaignExistsAction, fitRadiusAction, refreshAssetsAction, type WizardSubmission } from "../actions";
import { useLaunch } from "./use-launch";
import { fuzzyCustomerMatch, instagramAccountLabel, resolveClientByName } from "@/lib/customers";
import type { LaunchProgress } from "@/lib/launch";

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
 * Das Telefon rechts im Anlegen: es zeigt Texte und Anzeigen, wie sie
 * hinausgehen. Im Vorschlag steht es nicht – dort wird noch gewählt. Bei mehreren Standorten eine Vorschau mit
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
    <section className={form.reviewPreview}>
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
/**
 * Die Quellen des Vorschlags, zum Nachlesen: Aufgabe, Onboarding-Tabelle,
 * Drive-Ordner – nur die, die es gibt. Ohne Aufgabe (manueller Start) keiner.
 */
function QuellenMenu({ state }: { state: WizardState }) {
  const links = [
    state.taskId && { label: "Aufgabe in ClickUp", url: `https://app.clickup.com/t/${state.taskId}` },
    state.onboardingSheetId && {
      label: "Onboarding-Tabelle",
      url: `https://docs.google.com/spreadsheets/d/${state.onboardingSheetId}`,
    },
    state.driveFolderId && { label: "Drive-Ordner", url: `https://drive.google.com/drive/folders/${state.driveFolderId}` },
  ].filter((l): l is { label: string; url: string } => Boolean(l));
  if (!links.length) return null;
  return (
    <DropdownMenu
      button={{ label: "Quellen öffnen", variant: "ghost", size: "sm" }}
      hasChevron
      items={links.map((l) => ({ label: l.label, onClick: () => window.open(l.url, "_blank", "noopener") }))}
    />
  );
}

function Step({
  frage,
  satz,
  aside,
  children,
}: {
  frage: string;
  satz: ReactNode;
  /** Rechts neben der Frage – der Quellen-Knopf. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`step-enter ${form.step}`}>
      {/* Frage, Satz, Linie – in jedem Schritt dieselbe Kopfzeile. Der
          Haarstrich darunter macht aus der Frage einen Kopf statt des ersten
          Eintrags im Stapel: vorher stand sie im selben 24-px-Abstand zur
          ersten Eingabe wie jedes Feld zum nächsten, und ein Schritt las sich
          als eine lange Reihe gleichrangiger Blöcke. */}
      <header className={form.stepHeader}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Heading level={2}>{frage}</Heading>
            {/* Auf Textbreite gedeckelt: über die volle Karte gezogen bräuchte
                dieser eine Satz zwei Sprünge des Auges statt eines. */}
            <Text type="supporting" color="secondary" as="p" className="max-w-prose">
              {satz}
            </Text>
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
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
  /**
   * Eine bestehende Kampagne als Ausgangsstand (lib/seed.ts): „copy“ legt eine
   * neue mit denselben Werten an, „edit“ ändert sie. Kommt einmal mit der URL
   * (?from= / ?edit=) und wird beim Übernehmen aus ihr entfernt, damit ein
   * Neuladen den Entwurf zeigt und nicht wieder die Vorlage.
   */
  seed?: { seed: CampaignSeed; mode: "copy" | "edit" };
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
  seed,
}: WizardProps) {
  const { state, setState, loaded, restored, others, save, start, resume, remove, discard, park, forget } =
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
  // Standorte aus dem Auftrag stehen alle offen – sie kamen zusammen, und der
  // Assistent schreibt in jedem. Die id wechselt beim Wiederherstellen eines
  // Entwurfs, deshalb am Wert hängend.
  const firstSetId = state.adSets[0]?.id;
  useEffect(() => {
    if (firstSetId) setOpenSets(state.adSets.filter((a, i) => i === 0 || a.mirrorOf).map((a) => a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSetId]);
  // Welcher Standort in der Vorschau steht. Über die id, nicht den Index: wird
  // ein Standort davor entfernt, zeigte ein Index still auf einen anderen.
  // Fehlt die id, gilt der erste Standort.
  const [previewSetId, setPreviewSetId] = useState<string>();
  const { result, progress, pending, run, clear: clearLaunch } = useLaunch();
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

  // Der Zusammenbau streamt (app/api/brief): eine Meldung je Quelle, und die
  // Werkstatt (werkstatt.tsx) zeigt sie, während sie kommen. Vorher stand
  // zehn Sekunden ein Spinner auf dem Knopf und niemand sah, was gelesen wird.
  const pick = async (taskId: string) => {
    setPicking(taskId);
    setBriefError(undefined);
    clearActivity();
    announceBriefPlan();
    let brief: AssembledBrief | undefined;
    let partial: AssembledBrief | undefined;
    let error: string | undefined;
    // Sobald der feste Stand da ist (vor der Auflösung), wird er angewandt und
    // der Vorschlag geöffnet: die Texte fangen dann schon an, während der
    // Kontext-Aufruf noch läuft. Das Ergebnis danach ersetzt nur, was die
    // Auflösung anders sieht (reapplyBrief) – und lässt neu schreiben, wenn
    // sich die Grundlage der Texte geändert hat.
    try {
      // POST mit JSON: die Hinweise gehören nicht in URL, Verlauf oder Log.
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, aiNotes: state.aiNotes }),
      });
      if (!res.ok || !res.body) throw new Error(`Der Server antwortete mit ${res.status}.`);
      for await (const event of readNdjson<BriefStreamEvent>(res.body)) {
        if (event.type === "step") reportBriefEvent(event);
        else if (event.type === "partial") {
          partial = event.brief;
          const match = matchClient(partial);
          const early = partial;
          setState((s) => (match ? { ...applyBrief(s, early), business: match.name } : applyBrief(s, early)));
          if (match) setStep("1");
        } else {
          brief = event.brief;
          error = event.error;
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }
    if (!brief) {
      setPicking(undefined);
      return setBriefError(error ?? "Der Auftrag konnte nicht gelesen werden.");
    }
    setWarnings(brief.warnings);
    const match = matchClient(brief);
    const locs = brief.locations?.value ?? [];
    report({
      id: "adsets",
      label: "Anzeigengruppen",
      status: locs.length ? "done" : "skipped",
      detail:
        locs.length > 1
          ? `${locs.length} Standorte → ${locs.length} Anzeigengruppen: ${locs.map(cityOf).join(", ")}. Videos und Bilder werden geteilt.`
          : locs.length
            ? `eine Anzeigengruppe: ${cityOf(locs[0])}`
            : "kein Standort gefunden – bitte eintragen",
    });
    const assembled = brief;
    const early = partial;
    if (early) {
      // Der feste Stand ist schon drin – nur die Unterschiede der Auflösung.
      setState((s) => {
        const { state: next, textsChanged } = reapplyBrief(s, early, assembled);
        if (textsChanged) setRegenerate((n) => n + 1);
        return match ? { ...next, business: match.name } : next;
      });
      setStep(match ? "1" : "0");
      setPicking(undefined);
      return;
    }
    setRevealed(false);
    // Der letzte Haken soll gesehen werden, bevor der Schirm wechselt: ein
    // Bogen (700 ms), dann öffnet sich der Vorschlag.
    await new Promise((r) => setTimeout(r, 700));
    setState((s) => (match ? { ...applyBrief(s, assembled), business: match.name } : applyBrief(s, assembled)));
    setStep(match ? "1" : "0");
    setPicking(undefined);
  };

  // Der Kunde aus ClickUp heißt selten exakt wie die Meta-Seite. Exakt,
  // sonst der eine unscharfe Treffer, sonst bleibt der Name stehen und die
  // Kundenwahl zeigt ihn als nicht zugeordnet. Ohne Treffer bleibt die
  // Person auf dem Kundenfeld stehen, wo das Warnbanner das erklärt.
  const matchClient = (brief: AssembledBrief): WizardClient | undefined => {
    const name = brief.clientName?.value ?? "";
    report({ id: "match", label: "Meta-Kundenliste", status: "running", detail: "sucht die Seite des Kunden…" });
    const exact = resolveClientByName(clients, name);
    const fuzzy = exact ? [] : clients.filter((c) => fuzzyCustomerMatch(c.name, name));
    const match = exact ?? (fuzzy.length === 1 ? fuzzy[0] : undefined);
    report({
      id: "match",
      label: "Meta-Kundenliste",
      status: match ? "done" : "failed",
      detail: match
        ? `${match.name} · Seite „${match.pageName}“`
        : name
          ? `„${name}“ steht nicht in der Meta-Liste – bitte gleich wählen`
          : "die Aufgabe nennt keinen Kunden",
    });
    return match;
  };
  // Zählt hoch, wenn die Auflösung die Grundlage der Texte geändert hat – die
  // Blöcke schreiben dann neu (AdSetBlock, regenerateToken).
  const [regenerate, setRegenerate] = useState(0);

  // Ein neuer Anfang leert auch das Protokoll – sonst stünde die Werkstatt
  // des alten Auftrags über dem neuen. Was schon Arbeit war, bleibt als
  // Entwurf in der Liste (park) – ein Klick auf „Andere Aufgabe“ wirft
  // keine Texte und Uploads weg.
  const reset = () => {
    clearActivity();
    setRevealed(false);
    park();
  };

  // Solange der Assistent liest und schreibt, zeigt der Vorschlag nur den
  // Inhalt – das Einzige, was in der Zeit von Hand zu tun ist. Ist einmal
  // alles fertig, bleibt es offen, auch wenn später jemand Texte neu schreiben
  // lässt. Gelesen wird der Store direkt: die Blöcke melden in ihren eigenen
  // Effekten, die vor diesem hier laufen – der gerenderte Wert wäre noch leer.
  const activity = useActivity();
  const busy = activity.some((e) => e.status === "running");
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!activitySnapshot().some((e) => e.status === "running")) setRevealed(true);
  }, [busy]);
  const ready = revealed;

  // Der Umkreis ist Sache des Assistenten: ab 17 km die Leiter hinauf, bis
  // 150 000 Menschen erreicht sind (lib/geo-search.ts). Für jeden Standort mit
  // Adresse, dessen Radius noch auf dem Hausstandard steht – ein von Hand oder
  // aus der letzten Kampagne gesetzter Radius bleibt. Einmal je Gruppe.
  const fitted = useRef(new Set<string>());
  const fitKey = state.adSets.map((a) => `${a.id}|${a.addressString}|${a.radiusKm}`).join(";");
  useEffect(() => {
    if (Number(step) !== 1 || !state.adAccount) return;
    for (const set of state.adSets) {
      if (fitted.current.has(set.id) || !set.addressString.trim() || set.radiusKm !== DEFAULT_RADIUS_KM) continue;
      fitted.current.add(set.id);
      const id = `radius:${set.id}`;
      const label = state.adSets.length > 1 ? `Umkreis · ${cityOf(set.addressString)}` : "Umkreis";
      report({ id, label, status: "running", detail: "prüft die Reichweite ab 17 km, bis 150 000 Menschen erreicht sind…" });
      void fitRadiusAction(state.adAccount, {
        addressString: set.addressString,
        radiusKm: set.radiusKm,
        place: set.place,
      }).then((res) => {
        if ("error" in res) return report({ id, label, status: "failed", detail: res.error });
        const people = res.reach.ready ? `ca. ${new Intl.NumberFormat("de-DE").format(res.reach.lower)} Menschen` : "Reichweite unbekannt";
        report({
          id,
          label,
          status: res.enough ? "done" : "failed",
          detail: res.enough
            ? `${res.radiusKm} km · ${people}`
            : `auch bei ${res.radiusKm} km nur ${people} – bitte Ort prüfen`,
        });
        setState((s) => ({
          ...s,
          adSets: s.adSets.map((a) => (a.id === set.id && a.radiusKm === DEFAULT_RADIUS_KM ? { ...a, radiusKm: res.radiusKm } : a)),
        }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, fitKey, state.adAccount]);

  // Angelegt heißt fertig. Bliebe der Entwurf in der Liste, lüde er morgen
  // jemanden ein, dieselbe Kampagne ein zweites Mal anzulegen – und genau das
  // ist der Fehler, der bei Meta Geld kostet statt eine Fehlermeldung zu geben.
  // Auch bei teilweisem Erfolg: sobald eine campaignId existiert, steht sie.
  const campaignId = result.receipt?.campaignId;
  useEffect(() => {
    if (campaignId) forget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const clickup = useClickupCloseout(campaignId, state);
  const taskId = state.taskId;

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

  // Die Vorlage in den Assistenten – einmal, sobald die Entwürfe gelesen sind
  // (vorher überschriebe der wiederhergestellte Entwurf sie gleich wieder).
  // Der Kunde folgt der Seite aus promoted_object; kennt die Meta-Liste sie
  // nicht, bleibt der Name aus dem Kampagnennamen stehen und Schirm 1 sagt das.
  // Ins Protokoll kommt, was übernommen wurde – dieselbe Werkstatt wie beim
  // Auftrag, nur mit einer Kampagne statt einer Aufgabe als Quelle.
  useEffect(() => {
    if (!loaded || !seed) return;
    const { seed: vorlage, mode } = seed;
    const known = clients.find((c) => c.pageId === vorlage.pageId);
    clearActivity();
    setRevealed(false);
    setManual(false);
    start(stateFromSeed(vorlage, { mode, adAccount: defaultAccount, business: known?.name ?? "", initials }));
    setWarnings(vorlage.warnings);
    const ads = vorlage.adSets.reduce((n, s) => n + s.ads.length, 0);
    report({
      id: "vorlage",
      label: mode === "edit" ? "Kampagne bearbeiten" : "Vorlage",
      status: "done",
      detail: `„${vorlage.name}“ · ${plural(vorlage.adSets.length, "Standort", "Standorte")} · ${plural(ads, "Anzeige", "Anzeigen")}${known ? "" : " · Kunde nicht in der Meta-Liste – bitte wählen"}`,
      source: "campaign",
    });
    setStep(known ? "1" : "0");
    router.replace("/campaigns/new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  // Ein Kunde entsteht im Business Manager (Seite dem System User zuweisen),
  // nicht hier. Der Knopf holt danach nur die Liste: ohne den Tag-Wurf hielte
  // der Portfolio-Cache die neue Seite bis zu 5 Minuten zurück.
  const [reloading, startReload] = useTransition();
  const reloadClients = () =>
    startReload(async () => {
      await refreshAssetsAction();
      router.refresh();
    });
  useLeadgenTos(client, router);

  // Das Instagram-Konto hängt an der Seite des beworbenen Kunden, nicht am
  // zahlenden Konto. Es kommt mit der Kundenoption vom Server und ist deshalb
  // ohne zweiten Roundtrip sofort da.
  const instagram = client?.instagram;
  const instagramLabel = instagramAccountLabel(instagram);

  useCampaignNameSync(state, setState);
  const pageId = client?.pageId;
  const prefill = usePrefill(state, setState, pageId);

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
        // Wer die Anzeigen eines Spiegel-Standorts selbst anfasst, hat ihn
        // übernommen: ab da folgt er der Quelle nicht mehr.
        const next = { ...set, ...p };
        return "ads" in p && set.mirrorOf ? { ...next, mirrorOf: undefined } : next;
      });
      const next = { ...s, adSets: syncLinkedAds(sets) };
      return ownAddress ? edited(next, "location", {}) : next;
    });

  const removeAdSet = (i: number) => updateAdSets((sets) => sets.filter((_, idx) => idx !== i));
  // Die Kopie ist der Standort, an dem jetzt gearbeitet wird – sie klappt auf.
  const duplicate = (i: number) =>
    setState((s) => {
      const adSets = duplicateAdSet(s.adSets, i);
      setOpenSets([adSets[i + 1].id]);
      return { ...s, adSets };
    });

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
  // Bei jeder Änderung im Store neu gelesen – useUploadVersion() sorgt für das Rendern.
  const uploads = uploadStatus();
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
      // Jeder Punkt weiß, wohin er gehört – die Meldung springt dorthin.
      items: [
        ...perSet.flatMap(({ set, blockers }) => blockers.map((b) => ({ text: `„${set.name}“: ${b}`, area: `pruefung-${set.id}`, setId: set.id }))),
        ...detailBlockers(state).map((text) => ({ text, area: "pruefung-kampagne" })),
        ...customerBlockers(state).map((text) => ({ text, area: "pruefung-konto" })),
      ],
    };
  }, [state, client]);
  // Zum offenen Punkt springen: Aufklapper öffnen, hinscrollen, erstes leeres Feld fokussieren.
  const jumpTo = (item: { area: string; setId?: string }) => {
    if (item.setId) setOpenSets((open) => (open.includes(item.setId!) ? open : [...open, item.setId!]));
    requestAnimationFrame(() => {
      const el = document.getElementById(item.area);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Das erste leere Feld im Bereich – bei React-Feldern steht der Wert in
      // der Eigenschaft, nicht im Attribut, also nicht per Selektor.
      const fields = Array.from(el?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]), textarea") ?? []);
      (fields.find((f) => !f.value.trim()) ?? fields[0])?.focus({ preventScroll: true });
    });
  };

  // Der Vorschlag trägt beides: die Anzeigengruppen und die Felder darum.
  const stepIssues = [issues.customer.length, issues.adSets.length + issues.details.length, 0];
  const allIssues = [...issues.customer, ...issues.details, ...issues.adSets];
  const blocked = allIssues.length > 0;
  const reviewAreas = [
    ...issues.perSet.map(({ set, blockers }) => ({
      id: `pruefung-${set.id}`,
      label: set.name,
      issues: blockers.length,
    })),
    {
      id: "pruefung-kampagne",
      label: "Kampagne",
      issues: issues.details.length,
    },
    {
      id: "pruefung-konto",
      label: "Konto & Einstellungen",
      issues: issues.customer.length,
    },
  ];

  // Kein Fehler, sondern Geld: zwei Anzeigengruppen am selben Ort bieten bei
  // Meta gegeneinander und treiben den eigenen Preis je Lead hoch. Meta meldet
  // das nicht, und im Ads Manager sieht beides normal aus – deshalb hier, als
  // Hinweis und nicht als Blocker: manchmal ist genau das gewollt.
  const overlaps = useMemo(() => duplicateLocations(state.adSets), [state.adSets]);

  const submitWizard = (input: WizardSubmission) => {
    setSubmission(input);
    run(input);
  };

  /**
   * Anlegen, sobald die Uploads durch sind. Der Knopf lässt sich drücken, während
   * noch Videos laufen – auch wenn ein Standort deshalb noch ohne Anzeigen ist.
   * Angelegt wird erst, wenn nichts mehr läuft und nichts mehr im Eingang liegt
   * (sonst wäre der Stand hier älter als der bei Meta), und nur, wenn kein
   * Upload gescheitert ist und kein Punkt mehr offen steht. Sonst bleibt es beim
   * Hinweis, und der Knopf ist wieder frei.
   */
  const [queued, setQueued] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string>();
  const uploading = uploads.running > 0 || uploads.arriving;
  const verdict = queuedLaunch(uploads, blocked);
  useEffect(() => {
    if (!queued || verdict === "wait") return;
    setQueued(false);
    if (verdict === "abort") {
      setQueueNotice(
        uploads.failed
          ? `${uploads.failed === 1 ? "Ein Upload ist" : `${uploads.failed} Uploads sind`} fehlgeschlagen — nichts angelegt.`
          : `Nach dem Upload bleibt etwas offen — nichts angelegt: ${allIssues[0]}`,
      );
      return;
    }
    onCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, verdict]);

  /**
   * Der zweite Klick auf „Erstellen“ nach einer angelegten Kampagne legt sie
   * ein zweites Mal an – und das kostet bei Meta Geld statt eine Fehlermeldung.
   * Deshalb: steht die eben angelegte Kampagne noch, fragt ein Dialog nach.
   * Wurde sie inzwischen bei Meta gelöscht, geht es ohne Nachfrage weiter.
   * Bearbeiten (update) und der Retry-Pfad der Quittung sind keine neue
   * Kampagne und laufen daran vorbei.
   */
  const [confirmAgain, setConfirmAgain] = useState<"checking" | "open" | null>(null);
  const launched = campaignId && !state.editing ? campaignId : undefined;
  const onCreate = async () => {
    if (!launched) return createNow();
    setConfirmAgain("checking");
    const stillThere = await campaignExistsAction(launched);
    if (!stillThere) {
      setConfirmAgain(null);
      return createNow();
    }
    setConfirmAgain("open");
  };

  const createNow = () =>
    submitWizard({
      // Bearbeiten: dieselbe Nutzlast, nur mit den Meta-IDs und dem Schalter,
      // der lib/launch.ts ändern statt anlegen lässt.
      ...(state.editing ? { existingCampaignId: state.editing.campaignId, update: true } : {}),
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
      adSets: state.adSets.map(({ id: _id, loose: _loose, mirrorOf: _m, ads, ...rest }) => ({
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
  const editing = Boolean(state.editing);
  const steps = editing ? [STEPS[0], STEPS[1], "Übernehmen"] : STEPS;
  const previewSet = state.adSets.find((s) => s.id === previewSetId) ?? state.adSets[0];
  // Alles nach der Kundenwahl hängt am Kunden: die Seite trägt die Anzeigen,
  // sein Name baut den Kampagnennamen. Ohne ihn ist jeder weitere Schritt eine
  // Eingabe, die man später noch einmal machen darf.
  const locked = !client;
  // Solange kein Kunde feststeht und niemand ohne Aufgabe begonnen hat, steht
  // auf Schirm 1 die Aufgabenliste – in ihrer eigenen Karte unter dieser hier,
  // ohne Frage-Kopf und ohne Fußzeile: es gibt nichts zu speichern und nichts,
  // wohin man weiterginge.
  const showsList = firstScreen({ stepIndex, manual, business: state.business, taskId: state.taskId }) === "list";

  // Der Satz neben der Hauptaktion. In den Schirmen davor hält nichts auf – ein
  // offener Punkt darf liegen bleiben, und genau das muss dastehen, sonst liest
  // sich der Zähler in der Leiste als Sperre. Im letzten Schirm hält er sehr
  // wohl auf: dort ist der Knopf tot, und der Grund dafür stand vorher nur oben
  // in der Meldung, außer Sichtweite vom Knopf.
  const lastStep = stepIndex === STEPS.length - 1;
  const offen = lastStep ? allIssues.length : stepIssues[stepIndex];
  const fussHinweis =
    queued
      ? "Wird erstellt, sobald alle Uploads angekommen sind — nicht, wenn einer fehlschlägt."
      : pending || offen === 0
      ? undefined
      : lastStep
        ? `${offen === 1 ? "1 offener Punkt" : `${offen} offene Punkte`} — nachzulesen oben.`
        : offen === 1
          ? "1 offener Punkt — du kannst ihn später klären."
          : `${offen} offene Punkte — du kannst sie später klären.`;

  return (
    <div className={form.wizard}>
      {/* Ein wiederhergestellter Entwurf sieht aus wie ein frisch ausgefüllter –
          ohne diesen Hinweis baut jemand auf den Zahlen von gestern weiter. */}
      {restored && (
        <Banner
          status="warning"
          title="Entwurf wiederhergestellt"
          description="Die Eingaben stammen aus einer früheren Sitzung."
          endContent={
            <Button variant="secondary" size="sm" onClick={reset} label="Neu beginnen" />
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
            clearActivity();
            resume(id);
            if (others.find((d) => d.id === id)?.state.business) setStep("1");
          }}
          onRemove={remove}
        />
      )}

      {/* Die Karte legt ihre eigenen 16 px ab: Die Schrittleiste soll bis an
          beide Kanten reichen, und die Abschnitte darunter tragen mit 24 px
          mehr Rand, als eine Karte von sich aus gibt. */}
      <div className={form.shell}>
        {/* Der Zähler steht am Schirm, nicht erst am Ende: sonst erfährt man
            vom fehlenden Formular nach acht Uploads. Gesperrt, solange kein
            Kunde gewählt ist – siehe `locked`. */}
        <Stepper
          steps={steps.map((label, i) => ({ label, issues: stepIssues[i] }))}
          current={stepIndex}
          onSelect={(i) => setStep(String(i))}
          lockedFrom={locked ? 1 : STEPS.length}
          building={picking ? 1 : undefined}
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
                      reset();
                    }
                  : undefined
              }
            />
          </Step>
        )}

        {/* -------------------------------------------- Schirm 2: Vorschlag */}
        {stepIndex === 1 && (
          <Step
            aside={<QuellenMenu state={state} />}
            frage={ready ? "Prüfe den KI-Vorschlag" : "Welche Videos und Bilder?"}
            satz={
              ready
                ? "Die KI hat vorbereitet, was sie sicher ableiten konnte. Prüfe die offenen Punkte und überarbeite den Rest direkt im Formular."
                : "Der Assistent liest und schreibt noch. Wähle inzwischen die Inhalte — alles andere erscheint, sobald es steht."
            }
          >
            {/* Eine Spalte, ohne Telefon: die Vorschau gehört zum Anlegen,
                wenn Inhalt und Texte stehen – hier wird noch gewählt und
                korrigiert, und ein Telefon daneben zeigte halbe Zwischenstände. */}
            <div className="flex min-w-0 flex-col gap-6">
                {/* Was noch läuft – Texte, Regal, Formulare, letzte Kampagne –
                    in einer Zeile, aufklappbar zum Protokoll des Zusammenbaus. */}
                <Werkstattleiste areas={reviewAreas} />

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
                    {issues.perSet.map(({ set, blockers }, i) =>
                      // Bis der Assistent fertig ist, nur die erste Gruppe:
                      // Spiegel-Standorte teilen ihren Inhalt mit ihr.
                      !ready && i > 0 ? null : (
                      // Jeder Standort in einem eigenen Rahmen: aufgeklappt sind
                      // es zwei Bildschirmhöhen Felder, und ohne Kante war nicht
                      // zu sehen, wo der eine aufhört und der nächste anfängt.
                      <div key={set.id} id={`pruefung-${set.id}`} className="pruefbereich">
                        <Collapsible
                          value={set.id}
                          className={`collapsible-wide-trigger ${form.location}`}
                          trigger={
                          <span className={form.locationTitle}>
                            <span className={form.locationName}>
                              <span>{set.name}</span>
                              <span>
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
                          instructions={textInstructions(state)}
                          // Texte entstehen beim Betreten – aber nur im ersten
                          // Standort: die weiteren leihen sich Anzeigen und
                          // Texte (syncLinkedAds).
                          // Jede Gruppe schreibt ihre Texte selbst – der Ort
                          // steht drin, und der ist je Standort ein anderer.
                          autoGenerate
                          primary={i === 0}
                          stage={ready ? "alles" : "inhalt"}
                          formHint={state.formHint}
                          driveFolderId={state.driveFolderId}
                          initials={state.initials}
                          taskId={state.taskId}
                          notes={state.notes}
                          locationSource={i === 0 ? state.sources.location : undefined}
                          locationEvidence={i === 0 ? state.evidence?.location : undefined}
                          benefitsEvidence={state.evidence?.benefits}
                          regenerateToken={regenerate}
                          blockers={blockers}
                          otherAdSets={state.adSets
                            .filter((other) => other.id !== set.id)
                            .map(({ id, name, ads }) => ({ id, name, ads }))}
                          borrowersOfAd={(adId) => borrowersOf(state.adSets, set.id, adId)}
                          onChange={(patch) => updateAdSet(i, patch)}
                          onRemove={() => removeAdSet(i)}
                          onDuplicate={() => duplicate(i)}
                          canRemove={state.adSets.length > 1}
                          />
                        </Collapsible>
                      </div>
                      ),
                    )}
                  </div>
                </CollapsibleGroup>

                {/* Alles, was nach dem Inhalt kommt, kommt UNTER ihm dazu –
                    auch der Kampagnenkopf, der sonst oben stünde. Was oben
                    einrückt, schiebt weg, was man gerade ansieht; was unten
                    anwächst, lässt es stehen. */}
                {ready && (
                  <div className={`step-enter ${form.stack}`}>
                    {/* Mit Zeichen: der Knopf steht unter einer Liste von
                        Aufklappern, die alle links ein Element tragen – ohne
                        eigenes Zeichen las er sich als deren Fuß statt als
                        Handlung. */}
                    <div>
                      <Button
                        variant="secondary"
                        onClick={addLocation}
                        label="Standort hinzufügen"
                        icon={<Sign meaning="add" />}
                      />
                    </div>

                    <div id="pruefung-kampagne" className="pruefbereich">
                      <VorschlagKopf state={state} setState={setState} warnings={warnings} />
                    </div>

                    <div id="pruefung-konto" className="pruefbereich">
                      <Optional
                        state={state}
                        setState={setState}
                        accountSource={accountSource}
                        accountItem={accountItem}
                        prefill={prefill}
                        fixed={FIXED}
                      />
                    </div>
                  </div>
                )}
            </div>
          </Step>
        )}

        {/* ---------------------------------------------- Schirm 3: Anlegen */}
        {stepIndex === 2 && (
          <Step
            aside={<QuellenMenu state={state} />}
            frage="Passt alles?"
            satz={
              editing
                ? `„${state.editing!.name}“ wird bei Meta geändert: Name, Budget, Standorte und Texte an Ort und Stelle. Nur Anzeigen mit geänderten Texten oder Motiven bekommen eine neue Gestaltung; entfernte werden gelöscht. Der Status der Kampagne bleibt, wie er ist.`
                : "Kampagne, Anzeigengruppen und Anzeigen werden pausiert angelegt — es läuft nichts los und kostet nichts, bevor du sie bei Meta startest."
            }
          >
            {/* Zwei Spalten, sobald Platz ist: links die Prüfliste, rechts das
                Telefon. Untereinander ließ die Vorschau die halbe Seite leer –
                und wer prüft, will Zahlen und Anzeige gleichzeitig sehen. */}
            {launched && !pending ? (
              /* Der Erfolgsschirm: die Kampagne steht, hier ist nichts mehr zu
                 prüfen. Der Erstellen-Knopf unten bleibt – mit Nachfrage. */
              <div className="flex flex-col gap-6">
                <Banner
                  status="success"
                  title="Kampagne angelegt"
                  description={`„${state.campaignName}“ steht pausiert bei Meta. Starte sie im Ads Manager, sobald die Abnahme durch ist.`}
                  endContent={
                    <Button
                      variant="primary"
                      label="Im Ads Manager öffnen"
                      onClick={() => window.open(adsManagerUrl(state.adAccount, launched), "_blank", "noopener")}
                    />
                  }
                />
                <GhlHinweis />
                {submission && <ReceiptPanel state={result} submission={submission} onRetry={submitWizard} />}
                {clickup && (
                  <Banner
                    status={clickup.error ? "warning" : "success"}
                    title={clickup.error ? "ClickUp nicht aktualisiert" : "ClickUp-Aufgabe auf „Abnahme Kampagne“"}
                    description={
                      clickup.error ?? (
                        <>
                          Umbenannt in „{state.campaignName}“, Kommentar mit Ads-Manager-Link steht dran:{" "}
                          <Link href={`https://app.clickup.com/t/${taskId}`} target="_blank" rel="noreferrer">
                            Aufgabe in ClickUp öffnen
                          </Link>
                        </>
                      )
                    }
                  />
                )}
                <div>
                  <Button
                    variant="secondary"
                    label="Neue Kampagne beginnen"
                    icon={<Sign meaning="add" />}
                    onClick={() => {
                      clearLaunch();
                      setSubmission(null);
                      clearActivity();
                      setRevealed(false);
                      discard();
                      setStep("0");
                    }}
                  />
                </div>
              </div>
            ) : (
            <div className={form.review}>
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
                {queueNotice && (
                  <Banner
                    status="error"
                    title="Nicht erstellt"
                    description={queueNotice}
                    endContent={<Button variant="ghost" label="Verstanden" onClick={() => setQueueNotice(undefined)} />}
                  />
                )}
                {blocked && (
                  <Banner
                    status="warning"
                    title="Noch nicht bereit zum Erstellen"
                    description={
                      <ul className="list-disc space-y-1 pl-5">
                        {issues.items.map((item) => (
                          <li key={item.text}>
                            <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => jumpTo(item)}>
                              {item.text}
                            </button>
                          </li>
                        ))}
                        {allIssues
                          .filter((b) => !issues.items.some((i) => i.text === b))
                          .map((b) => (
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

                {campaignId && <GhlHinweis />}

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
                      clickup.error ?? (
                        <>
                          Umbenannt in „{state.campaignName}“, Kommentar mit Ads-Manager-Link steht dran:{" "}
                          <Link href={`https://app.clickup.com/t/${taskId}`} target="_blank" rel="noreferrer">
                            Aufgabe in ClickUp öffnen
                          </Link>
                        </>
                      )
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
            )}
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
          <Section
            variant="muted"
            padding={6}
            paddingBlock={4}
            dividers={["top"]}
            className={form.footer}
          >
            {/* Umbrechend statt starr nebeneinander: auf dem Telefon rutscht der
                Hinweis über die Knöpfe, statt den Weiter-Knopf zu zerdrücken. */}
            <div className={form.footerActions}>
              <Button
                variant="secondary"
                label="Zurück"
                icon={<Sign meaning="previous" />}
                isDisabled={stepIndex === 0 || pending}
                onClick={() => setStep(String(stepIndex - 1))}
              />

              <div className={form.footerEnd}>
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
                    variant="primary"
                    isDisabled={locked || (stepIndex === 1 && !ready)}
                    label={`Weiter: ${steps[stepIndex + 1]}`}
                    endContent={<Sign meaning="next" />}
                    onClick={() => setStep(String(stepIndex + 1))}
                  />
                ) : (
                  <Button
                    variant="primary"
                    onClick={
                      queued
                        ? () => setQueued(false)
                        : uploading
                          ? () => {
                              setQueueNotice(undefined);
                              setQueued(true);
                            }
                          : onCreate
                    }
                    isLoading={pending || queued || confirmAgain === "checking"}
                    // Ein wartender Knopf bleibt drückbar – der Klick nimmt das Warten zurück.
                    isInterruptible={queued}
                    isDisabled={pending || confirmAgain === "checking" || (blocked && !uploading)}
                    icon={pending || queued ? undefined : <Sign meaning="launch" />}
                    label={
                      pending
                        ? editing
                          ? "Wird geändert…"
                          : "Wird erstellt…"
                        : queued
                          ? `Wartet auf ${uploads.running === 1 ? "1 Upload" : `${uploads.running} Uploads`} — abbrechen`
                          : uploading
                            ? editing
                              ? "Nach dem Upload übernehmen"
                              : "Nach dem Upload erstellen"
                            : editing
                              ? "Änderungen übernehmen"
                              : launched
                                ? "Noch eine Kampagne erstellen"
                                : "Erstellen (pausiert)"
                    }
                  />
                )}
                <AlertDialog
                  isOpen={confirmAgain === "open"}
                  onOpenChange={(open) => !open && setConfirmAgain(null)}
                  title="Wirklich noch eine Kampagne anlegen?"
                  description={`„${state.campaignName}“ wurde gerade schon angelegt (Kampagne ${launched ?? ""}) und steht noch bei Meta – siehe die Quittung oben. Ein zweites Anlegen ergibt ein Duplikat.`}
                  cancelLabel="Abbrechen"
                  actionLabel="Trotzdem anlegen"
                  onAction={() => {
                    setConfirmAgain(null);
                    createNow();
                  }}
                />
              </div>
            </div>
          </Section>
        )}
      </div>

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
            // Im Entwurf, nicht daneben: so bleiben die Hinweise auch, wer
            // ohne Aufgabe beginnt, und ein Neuanfang (reset) leert sie mit.
            aiNotes={state.aiNotes}
            onAiNotesChange={(aiNotes) => setState((s) => ({ ...s, aiNotes }))}
            onPick={pick}
            onWithout={() => setManual(true)}
          />
        </>
      )}
    </div>
  );
}
