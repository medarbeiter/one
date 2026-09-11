"use client";

import { useEffect, useRef, useState } from "react";
import { adSetName } from "@/lib/naming";
import { locationProblem } from "@/lib/geo";
import { isSuggestedPair, nextCreativeName, normalizeAdName, planAds, uniqueName } from "@/lib/media";
import type { AssembledBrief, Source } from "@/lib/brief";
import type { AdInput, AdSetInput, FormatAsset } from "@/lib/launch";
import type { Orientation } from "@/lib/media";
import { parseCampaignName } from "@/lib/naming";
import type { BriefEvidence, Sourced } from "@/lib/brief";
import type { CampaignSeed, SeedAd } from "@/lib/seed";

// Der Einzelentwurf von früher: ein Stand, im sessionStorage dieses Tabs, weg
// beim Schließen des Fensters. Abgelöst von der Entwurfsliste weiter unten;
// steht hier nur noch, um beim ersten Laden einmal übernommen zu werden.
//
// v3: davor hieß das Feld der Anzeigengruppe `videos` – eine flache Dateiliste,
// eine Anzeige je Datei. Auf `ads` lässt sich das nicht abbilden, ohne Paarungen
// zu erfinden, die niemand bestätigt hat. Wie schon bei v1→v2 heißt der neue
// Schlüssel: alter Entwurf wird ignoriert statt halb wiederhergestellt.
const KEY = "medarbeiter:new-campaign:v3";

export type SourceField =
  | "clientName"
  | "roles"
  | "benefits"
  | "location"
  | "dailyBudget"
  | "spendCap"
  | "initials";
/** Ein Wert kann aus mehreren Quellen stammen („ClickUp + Onboarding“). */
export type Sources = Partial<Record<SourceField, Source[]>>;

/** Hausstandard – und der Vergleichswert, an dem applyBrief „unangefasst“ erkennt. */
export const DEFAULT_DAILY_BUDGET = 17;

export type WizardState = {
  /** Das Werbekonto, das zahlt – fast immer eins von MedArbeiter. */
  adAccount: string;
  /**
   * Der beworbene Kunde. Nicht dasselbe wie das Werbekonto: seine Facebook-
   * Seite trägt Anzeigen und Lead-Formulare, während MedArbeiter bezahlt.
   * Der Name ist der Schlüssel – er speist auch den Kampagnennamen.
   */
  business: string;
  roles: string[];
  roleFreeText: string;
  startDate: string; // yyyy-mm-dd, so it round-trips through sessionStorage
  initials: string;
  campaignName: string;
  /** true, sobald der Name von Hand geändert wurde – dann nicht mehr überschreiben. */
  nameEdited: boolean;
  dailyBudgetEuros: number;
  spendCapEuros?: number;
  /**
   * Was der Assistent nicht aus einer API weiß und was in jedem Text steht:
   * die Benefits des Arbeitgebers, eine je Zeile. Aus der Onboarding-Tabelle
   * gelesen oder getippt – im Entwurf, nicht mehr im Dialog.
   */
  benefits: string;
  /** Woher ein vorbelegtes Feld stammt. Verschwindet, sobald jemand es ändert (edited). */
  sources: Sources;
  /** Was jede Quelle zu einem Feld sagte – der Tooltip am Herkunftsetikett. */
  evidence?: BriefEvidence;
  /**
   * Freie Hinweise der bedienenden Person für die KI („Nur PFK, keine PDL“).
   * Nicht `notes` – das ist die wörtliche ClickUp-Beschreibung. Bleiben im
   * Vorschlag editierbar und gehen in jede Textanfrage.
   */
  aiNotes: string;
  /** Stil-, Ton- und Ausschlusswünsche, wie der Kampagnenkontext sie aus den Hinweisen las. */
  copyInstructions: string;
  /** Die ClickUp-Aufgabe, aus der dieser Entwurf kommt – nach dem Anlegen wechselt sie den Status. */
  taskId?: string;
  /** Die Beschreibung der Aufgabe, wörtlich – für Menschen, nicht für Felder. */
  notes?: string;
  /** Nach welchem Namen oder Ort das Lead-Formular zu wählen ist. */
  formHint?: string;
  /** Der Kundenordner in Drive, wenn bekannt – das Regal startet dann dort. */
  driveFolderId?: string;
  /** Die Onboarding-Tabelle darin – für den Quellen-Knopf. */
  onboardingSheetId?: string;
  /**
   * Gesetzt, wenn dieser Entwurf eine bestehende Kampagne ändert statt eine neue
   * anzulegen: Anzeigengruppen und Anzeigen tragen dann ihre Meta-IDs
   * (existingAdSetId, existingAdId), und der Anlegen-Knopf heißt „übernehmen“.
   */
  editing?: { campaignId: string; name: string };
  adSets: WizardAdSet[];
};

/**
 * Ein hochgeladenes Asset plus der Ausrichtung, die beim Auswählen aus den
 * Maßen gelesen wurde. Die Ausrichtung bleibt an der Anzeige hängen, weil das
 * Paaren von Hand sonst nicht wüsste, welche Hälfte das Hochformat ist.
 * lib/launch.ts sieht sie nie – toAdInput() streift sie ab.
 */
export type WizardVideoAsset = Extract<FormatAsset, { kind: "video" }> & {
  orientation: Orientation;
};
export type WizardImageAsset = Extract<FormatAsset, { kind: "image" }> & {
  orientation: Orientation;
  /** Fingerabdruck des Motivs für die Paarung – siehe fingerprintOf() in upload-queue.tsx. */
  fingerprint?: string;
  /** Die Überschrift im Bild, für die Paarung – siehe lib/headline.ts. */
  headline?: string;
  /**
   * Ein zugeschnittenes Bild merkt sich, woraus es geschnitten wurde: der zweite
   * Zuschnitt geht dann wieder vom Original aus, nicht vom Ausschnitt, und
   * verliert keine Pixel.
   */
  sourceHash?: string;
  sourceFileName?: string;
};
export type WizardAsset = WizardVideoAsset | WizardImageAsset;

/**
 * Eine Anzeige im Assistenten. `source` zeigt auf die Anzeigengruppe, aus der
 * sie geliehen ist – Änderungen an der Quelle wandern mit, eine Änderung an der
 * geliehenen Anzeige löst die Verbindung (copy-on-write, siehe Spec §6).
 */
export type WizardAd = {
  id: string;
  name: string;
  source?: { adSetId: string; adId: string };
  /** Gesetzt, wenn das Paar bewusst gegen die Regel gebildet wurde (zwei Videos,
   *  gemischte Medienarten, gleiche Ausrichtung). Hinweis, keine Sperre. */
  warn?: string;
  /** Warum der Assistent dieses Paar vorgeschlagen hat – steht an der Karte,
   *  damit ein falscher Vorschlag auffällt statt unbemerkt zu bleiben. */
  reason?: string;
  /** Beim Bearbeiten: diese Anzeige gibt es bei Meta schon (siehe WizardState.editing). */
  existingAdId?: string;
} & (
  | { type: "ugc"; asset: WizardVideoAsset }
  | { type: "single"; asset: WizardImageAsset }
  | { type: "split"; portrait: WizardAsset; square: WizardAsset }
);

/**
 * Hochgeladen, aber noch keiner Anzeige zugeordnet. Kein Fehlerzustand mehr:
 * ein Bild darf einzeln laufen (type "single"), das Paar ist ein Angebot.
 */
export type WizardLooseAsset = WizardAsset & { id: string };

export type WizardAdSet = Omit<AdSetInput, "ads"> & {
  id: string;
  ads: WizardAd[];
  loose: WizardLooseAsset[];
  /**
   * Ein Spiegel-Standort: führt alle eigenen Anzeigen der genannten
   * Anzeigengruppe als Leihen mit – auch die, die dort erst später ankommen.
   * So legt der Auftrag „Renningen und Stuttgart“ zwei Gruppen an, und wer die
   * Videos einmal in die erste zieht, hat sie in beiden. Fällt weg, sobald
   * jemand die Anzeigen dieses Standorts selbst anfasst (wizard.tsx).
   */
  mirrorOf?: string;
};

// Auch für den Prefill-Vergleich in wizard.tsx: nur wenn der Radius noch auf
// diesem Ausgangswert steht, hat ihn niemand von Hand gesetzt.
export const DEFAULT_RADIUS_KM = 17;

export const emptyAdSet = (index: number, city?: string): WizardAdSet => ({
  id: crypto.randomUUID(),
  name: adSetName(index, city),
  addressString: "",
  radiusKm: DEFAULT_RADIUS_KM,
  formId: "",
  bodies: [""],
  titles: [""],
  description: "",
  ads: [],
  loose: [],
});

export const initialState = (adAccount = "", business = "", initials = ""): WizardState => ({
  adAccount,
  business,
  roles: [],
  roleFreeText: "",
  startDate: new Date().toISOString().slice(0, 10),
  initials,
  campaignName: "",
  nameEdited: false,
  dailyBudgetEuros: DEFAULT_DAILY_BUDGET,
  benefits: "",
  sources: initials ? { initials: ["session"] } : {},
  aiNotes: "",
  copyInstructions: "",
  adSets: [emptyAdSet(0)],
});

/**
 * Der Auftrag ins Formular – aber nur in Felder, die noch auf dem
 * Ausgangswert stehen. Dieselbe Regel wie untouchedPrefillPatch in wizard.tsx:
 * ein fortgesetzter Entwurf, an dem schon jemand gearbeitet hat, wird nicht
 * überschrieben, nur ergänzt. Jedes gefüllte Feld bekommt seine Herkunft.
 */
export function applyBrief(state: WizardState, brief: AssembledBrief): WizardState {
  const sources: Sources = { ...state.sources };
  const next: WizardState = {
    ...state,
    taskId: brief.taskId,
    notes: brief.notes,
    aiNotes: brief.aiNotes,
    copyInstructions: brief.copyInstructions,
    formHint: brief.formHint?.value,
    driveFolderId: brief.driveFolderId?.value,
    onboardingSheetId: brief.onboardingSheetId,
    evidence: brief.evidence ?? state.evidence,
  };
  if (brief.clientName && !state.business.trim()) {
    next.business = brief.clientName.value;
    sources.clientName = brief.clientName.sources;
  }
  if (brief.roles && !state.roles.length) {
    next.roles = brief.roles.value;
    sources.roles = brief.roles.sources;
  }
  if (brief.roleFreeText && !state.roleFreeText.trim()) next.roleFreeText = brief.roleFreeText.value;
  if (brief.benefits && !state.benefits.trim()) {
    next.benefits = brief.benefits.value;
    sources.benefits = brief.benefits.sources;
  }
  if (brief.dailyBudgetEuros && state.dailyBudgetEuros === DEFAULT_DAILY_BUDGET) {
    next.dailyBudgetEuros = brief.dailyBudgetEuros.value;
    sources.dailyBudget = brief.dailyBudgetEuros.sources;
  }
  if (brief.spendCapEuros && state.spendCapEuros === undefined) {
    next.spendCapEuros = brief.spendCapEuros.value;
    sources.spendCap = brief.spendCapEuros.sources;
  }
  // Der erste Standort in die erste Gruppe, jeder weitere in eine eigene, die
  // die Anzeigen der ersten spiegelt (mirrorOf). Nur, solange noch niemand
  // einen Standort angefasst hat – sonst bleibt alles, wie es ist.
  const first = state.adSets[0];
  const [head, ...more] = brief.locations?.value ?? [];
  if (head && first && state.adSets.length === 1 && first.addressString === "" && !first.place) {
    next.adSets = [
      { ...first, addressString: head },
      ...more.map((addressString, i) => ({
        ...emptyAdSet(i + 1, cityOf(addressString)),
        addressString,
        mirrorOf: first.id,
      })),
    ];
    sources.location = brief.locations!.sources;
  }
  // Ein in der Aufgabe genannter Umkreis gilt für alle Gruppen, die noch auf
  // dem Hausstandard stehen – und hält damit die Reichweiten-Leiter an
  // (wizard.tsx passt nur Gruppen mit DEFAULT_RADIUS_KM an).
  if (brief.radiusKm)
    next.adSets = next.adSets.map((a) => (a.radiusKm === DEFAULT_RADIUS_KM ? { ...a, radiusKm: brief.radiusKm!.value } : a));
  return { ...next, sources };
}

/**
 * Der zweite Stand des Briefs über den ersten: der feste Vorschlag (partial)
 * ist schon angewandt, Texte werden vielleicht schon geschrieben – jetzt kommt
 * die Auflösung. Ersetzt wird nur, was sie anders sieht; die Anzeigengruppen
 * behalten ihre IDs (laufende Uploads sind an sie adressiert) und ihre
 * Anzeigen. Liefert dazu, ob sich etwas geändert hat, woraus Texte entstehen –
 * dann schreibt der Block sie neu.
 */
export function reapplyBrief(
  state: WizardState,
  partial: AssembledBrief,
  final: AssembledBrief,
): { state: WizardState; textsChanged: boolean } {
  const same = <T,>(a: Sourced<T> | undefined, b: Sourced<T> | undefined) =>
    JSON.stringify(a?.value) === JSON.stringify(b?.value);
  const next: WizardState = { ...state, sources: { ...state.sources }, evidence: final.evidence ?? state.evidence };
  next.copyInstructions = final.copyInstructions;
  next.formHint = final.formHint?.value;
  let textsChanged = false;
  if (!same(partial.roles, final.roles)) {
    next.roles = final.roles?.value ?? [];
    if (final.roles) next.sources.roles = final.roles.sources;
    else delete next.sources.roles;
    textsChanged = true;
  }
  if (!same(partial.roleFreeText, final.roleFreeText)) {
    next.roleFreeText = final.roleFreeText?.value ?? "";
    textsChanged = true;
  }
  if (!same(partial.benefits, final.benefits)) {
    next.benefits = final.benefits?.value ?? "";
    if (final.benefits) next.sources.benefits = final.benefits.sources;
    else delete next.sources.benefits;
    textsChanged = true;
  }
  if (!same(partial.dailyBudgetEuros, final.dailyBudgetEuros) && final.dailyBudgetEuros) {
    next.dailyBudgetEuros = final.dailyBudgetEuros.value;
    next.sources.dailyBudget = final.dailyBudgetEuros.sources;
  }
  if (!same(partial.spendCapEuros, final.spendCapEuros)) {
    next.spendCapEuros = final.spendCapEuros?.value;
    if (final.spendCapEuros) next.sources.spendCap = final.spendCapEuros.sources;
    else delete next.sources.spendCap;
  }
  if (!same(partial.locations, final.locations) && final.locations?.value.length) {
    const [head, ...more] = final.locations.value;
    const first = state.adSets[0];
    next.adSets = [
      { ...first, addressString: head, place: undefined },
      ...more.map((addressString, i) => ({ ...emptyAdSet(i + 1, cityOf(addressString)), addressString, mirrorOf: first.id })),
    ];
    next.sources.location = final.locations.sources;
    textsChanged = true;
  }
  if (!same(partial.radiusKm, final.radiusKm) && final.radiusKm)
    next.adSets = next.adSets.map((a) => (a.radiusKm === DEFAULT_RADIUS_KM ? { ...a, radiusKm: final.radiusKm!.value } : a));
  if (!same(partial.copyInstructions ? { value: partial.copyInstructions, sources: [] } : undefined, final.copyInstructions ? { value: final.copyInstructions, sources: [] } : undefined))
    textsChanged = true;
  return { state: next, textsChanged };
}

/**
 * Ein Standort als Vorlage für den nächsten: Texte, Formular und Radius
 * kommen mit, die Anzeigen als Spiegel (mirrorOf), die Adresse bleibt leer –
 * sie ist ja das, was sich unterscheidet.
 */
export function duplicateAdSet(sets: WizardAdSet[], i: number): WizardAdSet[] {
  const src = sets[i];
  if (!src) return sets;
  const copy: WizardAdSet = {
    ...emptyAdSet(sets.length),
    name: `${src.name} (Kopie)`,
    radiusKm: src.radiusKm,
    formId: src.formId,
    bodies: [...src.bodies],
    titles: [...src.titles],
    description: src.description,
    dailyBudgetCents: src.dailyBudgetCents,
    mirrorOf: src.mirrorOf ?? src.id,
  };
  return syncLinkedAds([...sets.slice(0, i + 1), copy, ...sets.slice(i + 1)]);
}

/** Hat jemand hier schon etwas getan, das ein Neuanfang wegwerfen würde? */
export const hasWork = (state: WizardState): boolean =>
  state.adSets.some(
    (a) =>
      a.ads.length > 0 ||
      a.loose.length > 0 ||
      a.bodies.some((b) => b.trim()) ||
      a.titles.some((t) => t.trim()) ||
      a.description.trim() !== "",
  );

/**
 * Was Schirm 1 zeigt: die Aufgabenliste, solange kein Kunde feststeht und
 * niemand ohne Aufgabe begonnen hat – sonst die Kundenwahl.
 */
export const firstScreen = (s: { stepIndex: number; manual: boolean; business: string; taskId?: string }): "list" | "customer" | "other" =>
  s.stepIndex !== 0 ? "other" : !s.manual && !s.business && !s.taskId ? "list" : "customer";

/**
 * Was jede Textanfrage an Kontext bekommt: was der Kampagnenkontext aus den
 * Hinweisen las, plus die Hinweise selbst in ihrem aktuellen Stand. So wirkt
 * eine Änderung sofort, ohne ClickUp und Drive neu zu lesen – und auch eine
 * Kampagne ohne Aufgabe nimmt ihre Hinweise mit.
 */
export const textInstructions = (state: Pick<WizardState, "aiNotes" | "copyInstructions">): string =>
  [state.copyInstructions, state.aiNotes].map((t) => t.trim()).filter(Boolean).join("\n");

/** „Mühlgasse 24, 71272 Renningen“ → „Renningen“; ohne PLZ der Text selbst. */
export function cityOf(addressString: string): string {
  const m = /\b\d{5}\s+([^,]+)/.exec(addressString);
  return (m?.[1] ?? addressString.split(",").pop() ?? addressString).trim();
}

/** Eine Änderung von Hand: der Wert wechselt, das Herkunftsetikett fällt. */
export function edited(state: WizardState, field: SourceField, patch: Partial<WizardState>): WizardState {
  const { [field]: _gone, ...sources } = state.sources;
  return { ...state, ...patch, sources };
}

/** Ohne die UI-Felder (id, orientation), die auf dem Weg zu Meta nichts verloren haben. */
const toFormatAsset = (a: WizardAsset): FormatAsset =>
  a.kind === "video"
    ? { kind: "video", videoId: a.videoId, thumbnailUrl: a.thumbnailUrl, fileName: a.fileName }
    : { kind: "image", hash: a.hash, fileName: a.fileName };

/** Der Teil einer WizardAd, den lib/launch.ts kennt – ohne UI-Felder. */
export function toAdInput(ad: WizardAd): AdInput {
  const meta = ad.existingAdId ? { existingAdId: ad.existingAdId } : {};
  if (ad.type === "ugc")
    return {
      name: ad.name,
      ...meta,
      type: "ugc",
      asset: toFormatAsset(ad.asset) as Extract<FormatAsset, { kind: "video" }>,
    };
  if (ad.type === "single")
    return {
      name: ad.name,
      ...meta,
      type: "single",
      asset: toFormatAsset(ad.asset) as Extract<FormatAsset, { kind: "image" }>,
    };
  return {
    name: ad.name,
    ...meta,
    type: "split",
    portrait: toFormatAsset(ad.portrait),
    square: toFormatAsset(ad.square),
  };
}

/**
 * Ein Asset aus Meta zurück in den Assistenten. Die Ausrichtung kennt Meta
 * beim Lesen nicht: bei einem Paar sagt sie der Platz, ein Einzelbild gilt als
 * quadratisch – das Paaren von Hand liest die Ausrichtung ohnehin neu.
 */
const seededAsset = (a: FormatAsset, orientation: Orientation): WizardAsset =>
  a.kind === "video" ? { ...a, orientation } : { ...a, orientation };

const seededAd = (ad: SeedAd, keepId: boolean): WizardAd => {
  const base = { id: crypto.randomUUID(), name: ad.name, ...(keepId ? { existingAdId: ad.metaId } : {}) };
  if (ad.type === "ugc") return { ...base, type: "ugc", asset: seededAsset(ad.asset, "portrait") as WizardVideoAsset };
  if (ad.type === "single") return { ...base, type: "single", asset: seededAsset(ad.asset, "square") as WizardImageAsset };
  return { ...base, type: "split", portrait: seededAsset(ad.portrait, "portrait"), square: seededAsset(ad.square, "square") };
};

/**
 * Eine bestehende Kampagne als Ausgangsstand des Assistenten. Zwei Spielarten:
 *
 * - „copy“ legt eine neue Kampagne mit denselben Werten an: heutiges Datum,
 *   Name aus der Konvention, Anzeigen ohne Meta-IDs (die Videos und Bilder
 *   liegen im Werbekonto und werden wiederverwendet, nicht neu hochgeladen).
 * - „edit“ ändert die Kampagne selbst: Name bleibt, Anzeigengruppen und
 *   Anzeigen behalten ihre IDs, damit lib/launch.ts sie an Ort und Stelle
 *   ändert statt daneben neue anzulegen.
 *
 * Jedes übernommene Feld trägt die Herkunft „campaign“, bis jemand es ändert.
 * Die Benefits stehen nicht bei Meta – sie kommen aus der ✅-Liste der
 * Beschreibung zurück, wenn es eine gibt, damit neue Texte sie wieder kennen.
 */
export function stateFromSeed(
  seed: CampaignSeed,
  opts: { mode: "copy" | "edit"; adAccount: string; business: string; initials: string },
): WizardState {
  const edit = opts.mode === "edit";
  const parsed = parseCampaignName(seed.name);
  const business = opts.business || parsed?.business || "";
  const description = seed.adSets[0]?.description ?? "";
  const benefits = description.includes("✅")
    ? description
        .split("\n")
        .filter((l) => l.includes("✅"))
        .map((l) => l.replace(/^[\s✅]+/, "").trim())
        .filter(Boolean)
        .join("\n")
    : "";
  const sources: Sources = {
    ...(business ? { clientName: ["campaign"] } : {}),
    ...(parsed?.roles.length ? { roles: ["campaign"] } : {}),
    ...(seed.adSets.length ? { location: ["campaign"] } : {}),
    ...(seed.dailyBudgetEuros !== undefined ? { dailyBudget: ["campaign"] } : {}),
    ...(seed.spendCapEuros !== undefined ? { spendCap: ["campaign"] } : {}),
    ...(opts.initials ? { initials: ["session"] } : {}),
  };
  const adSets: WizardAdSet[] = seed.adSets.length
    ? seed.adSets.map((set, i) => ({
        ...emptyAdSet(i, cityOf(set.addressString)),
        name: set.name,
        addressString: set.addressString,
        radiusKm: set.radiusKm,
        ...(set.place ? { place: set.place } : {}),
        formId: set.formId,
        bodies: set.bodies.length ? set.bodies : [""],
        titles: set.titles.length ? set.titles : [""],
        description: set.description,
        ...(edit ? { existingAdSetId: set.metaId } : {}),
        ads: set.ads.map((ad) => seededAd(ad, edit)),
      }))
    : [emptyAdSet(0)];
  return {
    ...initialState(opts.adAccount, business, opts.initials),
    roles: parsed?.roles ?? [],
    roleFreeText: parsed?.roleFreeText ?? "",
    // Beim Bearbeiten bleibt der Name, wie er bei Meta steht – auch ein alter,
    // der nicht der Konvention folgt. Beim Duplizieren entsteht er neu.
    campaignName: edit ? seed.name : "",
    nameEdited: edit,
    dailyBudgetEuros: seed.dailyBudgetEuros ?? DEFAULT_DAILY_BUDGET,
    ...(seed.spendCapEuros !== undefined ? { spendCapEuros: seed.spendCapEuros } : {}),
    benefits,
    sources,
    ...(edit ? { editing: { campaignId: seed.campaignId, name: seed.name } } : {}),
    adSets,
  };
}

/** Aus einer geliehenen Anzeige wird eine eigene. */
export function detachAd(ad: WizardAd): WizardAd {
  if (!ad.source) return ad;
  const { source: _source, ...own } = ad;
  return own as WizardAd;
}

/** Welche Anzeigengruppen leihen sich diese Anzeige? Für die Rückfrage vor dem Entfernen. */
export const borrowersOf = (adSets: WizardAdSet[], adSetId: string, adId: string): string[] =>
  adSets
    .filter((s) => s.ads.some((a) => a.source?.adSetId === adSetId && a.source.adId === adId))
    .map((s) => s.name);

/**
 * Geliehene Anzeigen aus ihrer Quelle auffrischen – das ist die Verbindung:
 * eine Änderung an der Quelle erreicht jeden Entleiher. Fehlt die Quelle, weil
 * die Anzeige oder die ganze Anzeigengruppe entfernt wurde, behält der Entleiher
 * seinen Inhalt und steht ab sofort für sich. Fremder Inhalt wird nie als
 * Nebenwirkung gelöscht; die Assets liegen ohnehin schon im Werbekonto.
 */
export function syncLinkedAds(input: WizardAdSet[]): WizardAdSet[] {
  // Spiegel zuerst: jede eigene Anzeige der Quelle bekommt im Spiegel eine
  // Leihe, die es noch nicht gibt; Leihen auf verschwundene Quellen fallen
  // unten durch detachAd zurück auf sich selbst.
  const adSets = input.map((set) => {
    if (!set.mirrorOf) return set;
    const src = input.find((s) => s.id === set.mirrorOf);
    if (!src) return { ...set, mirrorOf: undefined };
    const have = new Set(set.ads.filter((a) => a.source?.adSetId === src.id).map((a) => a.source!.adId));
    const fresh = src.ads
      .filter((a) => !a.source && !have.has(a.id))
      .map((a): WizardAd => {
        const { id: _id, ...content } = a;
        return { ...content, id: crypto.randomUUID(), source: { adSetId: src.id, adId: a.id } };
      });
    return fresh.length ? { ...set, ads: [...set.ads, ...fresh] } : set;
  });

  // Nur eigene Anzeigen taugen als Quelle – sonst hinge eine Leihe an einer Leihe.
  const source = (adSetId: string, adId: string) =>
    adSets.find((s) => s.id === adSetId)?.ads.find((a) => a.id === adId && !a.source);

  return adSets.map((set) => ({
    ...set,
    ads: set.ads.map((ad) => {
      if (!ad.source) return ad;
      const src = source(ad.source.adSetId, ad.source.adId);
      if (!src) return detachAd(ad);
      // Name inbegriffen: "Creative 1" heißt an jedem Standort dasselbe.
      const { id: _id, source: _s, ...content } = src;
      return { ...content, id: ad.id, source: ad.source } as WizardAd;
    }),
  }));
}

/**
 * Neu hochgeladene Dateien mit dem, was noch ungepaart herumliegt, zu Anzeigen
 * planen: Videos werden UGC, Bilder suchen sich über benachbarte Namen ihre
 * Hälfte. Was übrig bleibt, bleibt sichtbar liegen statt geraten zu werden.
 *
 * Steht hier und nicht mehr im Block, weil nicht mehr der Block die Dateien
 * entgegennimmt: sie kommen aus upload-queue.ts und landen im Assistenten, auch
 * wenn gerade ein anderer Schritt offen ist. Nebenbei ist es damit prüfbar –
 * gerechnet wird ausdrücklich auf dem übergebenen Stand, denn zwei kurz
 * hintereinander fertige Dateien würden sich sonst gegenseitig verwerfen.
 */
export function withArrivedAssets(
  set: WizardAdSet,
  arrived: WizardLooseAsset[],
): Pick<WizardAdSet, "ads" | "loose"> {
  // Dieselbe Datei zweimal gewählt – aus zwei Ordnern, oder weil der erste
  // Schwung noch lief. Ein Bild-Hash ist der Inhalt; bei Videos ist es der
  // Dateiname, denn Meta vergibt je Upload eine neue ID.
  const known = new Set(
    [...set.loose, ...set.ads.flatMap((a) => (a.type === "split" ? [a.portrait, a.square] : [a.asset]))]
      .map(assetKey),
  );
  const unseen = arrived.filter((a) => {
    const key = assetKey(a);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  // Vorgeschlagene Paare werden mit neu geplant, nicht festgehalten: die
  // Dateien kommen einzeln an, und „page-4“ hatte sich sonst schon „page-5“
  // genommen, bevor „page-3“ fertig war. Gerechnet wird über alles, was da
  // ist – das Ergebnis ist dasselbe wie bei einem einzigen Schwung. Was von
  // Hand gepaart oder zugeschnitten wurde, bleibt unangetastet.
  const suggested = set.ads.filter(
    (a): a is Extract<WizardAd, { type: "split" }> => a.type === "split" && !a.source && isSuggestedPair(a.reason),
  );
  const dissolved = new Set<WizardAd>(suggested);
  const kept = set.ads.filter((a) => !dissolved.has(a));
  const halves = suggested.flatMap((a) => [a.portrait, a.square]).map(looseFrom);
  const { ads: planned, unpaired } = planAds([...set.loose, ...halves, ...unseen]);
  // Ein Paar, das wieder herauskommt, behält Name und ID – nichts springt.
  const pairKey = (p: WizardAsset, s: WizardAsset) => `${assetKey(p)}|${assetKey(s)}`;
  const before = new Map(suggested.map((a) => [pairKey(a.portrait, a.square), a]));
  const taken = new Set(kept.map((a) => a.name));
  for (const p of planned)
    if (p.type === "split") {
      const same = before.get(pairKey(p.portrait, p.square));
      if (same) taken.add(same.name);
    }

  const fresh = planned.map((p): WizardAd => {
    if (p.type === "ugc") {
      // Der Dateiname auf eine Schreibweise gebracht: Endung weg, Wörter groß,
      // Ziffern abgesetzt, Kürzel aus KEEP_CAPS in Versalien (normalizeAdName in
      // lib/media.ts). Sonst steht dieselbe Person in Metas Anzeigenliste als
      // „Lea1“, „lea 1“ und „LEA  1“ nebeneinander und ist in der Auswertung
      // nicht mehr gruppierbar. Erst danach entdoppeln, damit uniqueName die
      // endgültige Schreibweise sieht.
      const name = uniqueName(normalizeAdName(p.asset.fileName), taken);
      taken.add(name);
      // planAds() steckt ausschließlich Videos in "ugc".
      return { id: crypto.randomUUID(), name, type: "ugc", asset: p.asset as WizardVideoAsset };
    }
    const same = before.get(pairKey(p.portrait, p.square));
    if (same) return same;
    const name = nextCreativeName(taken);
    taken.add(name);
    return {
      id: crypto.randomUUID(),
      name,
      type: "split",
      portrait: p.portrait,
      square: p.square,
      reason: p.reason,
    };
  });

  return { ads: [...kept, ...fresh], loose: unpaired };
}

const assetKey = (a: WizardAsset) => (a.kind === "image" ? `i:${a.hash}` : `v:${a.fileName}`);

const looseFrom = (asset: WizardAsset): WizardLooseAsset => ({ ...asset, id: crypto.randomUUID() });

/**
 * Eine Anzeige gibt ihre Motive zurück in die Ablage. Jeder Weg in eine Anzeige
 * hinein hat damit einen Rückweg: das gepaarte Foto-Paar, das einzeln laufende
 * Bild und das UGC-Video, das aus einer Datei entstanden ist.
 *
 * Die Namen bleiben nicht erhalten – eine liegengebliebene Datei trägt keinen
 * Anzeigennamen. Wer sie später wieder befördert, bekommt ihn aus dem Dateinamen
 * zurück (promoteLoose), und das ist derselbe, mit dem sie angekommen war.
 */
export function dissolveAd(
  set: Pick<WizardAdSet, "ads" | "loose">,
  adId: string,
): Pick<WizardAdSet, "ads" | "loose"> {
  const ad = set.ads.find((a) => a.id === adId);
  if (!ad) return { ads: set.ads, loose: set.loose };
  const assets = ad.type === "split" ? [ad.portrait, ad.square] : [ad.asset];
  return {
    ads: set.ads.filter((a) => a.id !== adId),
    loose: [...set.loose, ...assets.map(looseFrom)],
  };
}

/**
 * Der Rückweg aus der Ablage: ein Bild wird zur Einzelbild-Anzeige, ein Video
 * wieder zu UGC. Ohne den Video-Fall wäre eine getrennte Paarung eine Sackgasse
 * – das Video läge in der Ablage, und nichts holte es heraus.
 */
export function promoteLoose(
  set: Pick<WizardAdSet, "ads" | "loose">,
  looseId: string,
): Pick<WizardAdSet, "ads" | "loose"> {
  const found = set.loose.find((x) => x.id === looseId);
  if (!found) return { ads: set.ads, loose: set.loose };
  const taken = new Set(set.ads.map((a) => a.name));
  const loose = set.loose.filter((x) => x.id !== looseId);
  const id = crypto.randomUUID();

  // Die ID der Ablage bleibt in der Ablage – an einer Anzeige hat sie nichts zu suchen.
  if (found.kind === "video") {
    const { id: _id, ...asset } = found;
    const name = uniqueName(normalizeAdName(asset.fileName), taken);
    return { ads: [...set.ads, { id, name, type: "ugc", asset }], loose };
  }
  const { id: _id, ...asset } = found;
  return { ads: [...set.ads, { id, name: nextCreativeName(taken, "Bild"), type: "single", asset }], loose };
}

/**
 * Zuschnitte kommen zurück – einer oder beide Formate auf einmal. Drei Fälle,
 * und nur einer ist ein Ersatz:
 *
 * - In einem Paar ersetzt jeder Zuschnitt die Hälfte seines Formats.
 * - Ein Einzelbild oder eine liegengebliebene Datei, ins *andere* Format
 *   geschnitten, wird zum Paar aus Original und Ausschnitt – genau dafür
 *   schneidet man ein einzelnes Bild zu. Kommt das eigene Format mit, steht
 *   dieser Ausschnitt statt des Originals im Paar.
 * - Nur ins *gleiche* Format geschnitten (4:5 → 1:1) ersetzt er das Bild.
 */
export function applyCrop(
  set: Pick<WizardAdSet, "ads" | "loose">,
  at: { adId: string } | { looseId: string },
  cropped: WizardImageAsset | WizardImageAsset[],
): Pick<WizardAdSet, "ads" | "loose"> {
  const crops = Array.isArray(cropped) ? cropped : [cropped];
  const by = (o: Orientation) => crops.find((c) => c.orientation === o);
  const fromOne = (
    original: WizardImageAsset,
  ): { single: WizardImageAsset } | { pair: { portrait: WizardImageAsset; square: WizardImageAsset } } => {
    const own = by(original.orientation) ?? original;
    const other = by(original.orientation === "portrait" ? "square" : "portrait");
    if (!other) return { single: own };
    return { pair: original.orientation === "portrait" ? { portrait: own, square: other } : { portrait: other, square: own } };
  };

  if ("looseId" in at) {
    const found = set.loose.find((x) => x.id === at.looseId);
    if (!found || found.kind !== "image") return set;
    const { id: _id, ...original } = found;
    const r = fromOne(original);
    if ("single" in r)
      return { ads: set.ads, loose: set.loose.map((x) => (x.id === at.looseId ? { ...r.single, id: x.id } : x)) };
    const taken = new Set(set.ads.map((a) => a.name));
    return {
      ads: [
        ...set.ads,
        {
          id: crypto.randomUUID(),
          name: nextCreativeName(taken),
          type: "split",
          ...r.pair,
          reason: `Aus einem Bild zugeschnitten: ${original.fileName}`,
        },
      ],
      loose: set.loose.filter((x) => x.id !== at.looseId),
    };
  }

  return {
    loose: set.loose,
    ads: set.ads.map((a) => {
      if (a.id !== at.adId) return a;
      if (a.type === "single") {
        const r = fromOne(a.asset);
        if ("single" in r) return detachAd({ ...a, asset: r.single });
        const { asset, ...rest } = a;
        // Aus „Bild N“ wird ein Paar – und das heißt „Creative N“.
        const taken = new Set(set.ads.filter((x) => x.id !== a.id).map((x) => x.name));
        return detachAd({
          ...rest,
          name: /^Bild \d+$/.test(a.name) ? nextCreativeName(taken) : a.name,
          type: "split",
          ...r.pair,
          reason: `Aus einem Bild zugeschnitten: ${asset.fileName}`,
        });
      }
      if (a.type === "split")
        return detachAd({ ...a, portrait: by("portrait") ?? a.portrait, square: by("square") ?? a.square });
      return a;
    }),
  };
}

/**
 * Die beiden Hälften eines Paares wechseln die Platzierung. Nötig, weil die
 * automatische Zuordnung die Ausrichtung aus den Maßen liest und ein Motiv
 * durchaus im anderen Rahmen besser steht – Meta schneidet es dort selbst zu.
 * Die Warnung bleibt, wie sie ist: sie vergleicht beide Hälften miteinander und
 * ist gegen das Tauschen unempfindlich.
 */
export function swapPair(ads: WizardAd[], adId: string): WizardAd[] {
  return ads.map((a) =>
    a.id === adId && a.type === "split"
      ? detachAd({ ...a, portrait: a.square, square: a.portrait })
      : a,
  );
}

/**
 * DEGREES_OF_FREEDOM verlangt mindestens ein Textfeld mit mehr als einem
 * Eintrag; mit je einem Text lehnt Meta jede Anzeige mit einem einzelnen Motiv
 * ab – UGC-Video wie Einzelbild. Split-Anzeigen (PLACEMENT) trifft das nicht.
 */
export function needsSecondText(set: Pick<WizardAdSet, "ads" | "bodies" | "titles">): boolean {
  const filled = (xs: string[]) => xs.filter((x) => x.trim()).length;
  return (
    set.ads.some((a) => a.type === "ugc" || a.type === "single") &&
    filled(set.bodies) < 2 &&
    filled(set.titles) < 2
  );
}

/**
 * Was Meta an dieser Anzeigengruppe ablehnen würde. Eine Liste, zwei Leser: die
 * Kopfzeile des Standorts zeigt sie als Zähler, die Überprüfung als Text. Vorher
 * kannte nur der letzte Schritt sie – man erfuhr vom fehlenden Lead-Formular
 * erst nach dem Hochladen von acht Videos.
 */
export function adSetBlockers(set: WizardAdSet): string[] {
  // Ein gewählter Ort zählt als Standort, auch wenn nichts getippt wurde – und
  // ein Radius außerhalb von Metas Grenzen hält hier auf, nicht erst beim
  // Anlegen der Anzeigengruppe.
  const location = locationProblem(set);
  return [
    ...(location ? [location] : []),
    ...(set.ads.length ? [] : ["Es gibt noch keine Anzeigen."]),
    // Liegengebliebene Dateien halten nichts mehr auf: ein Bild darf einzeln
    // laufen, und wer eines übrig lässt, hat es vielleicht bewusst getan. Der
    // Hinweis dazu steht an den Dateien selbst (siehe ad-set-block.tsx).
    ...(set.formId ? [] : ["Es ist kein Lead-Formular ausgewählt."]),
    ...(set.bodies.some((b) => b.trim()) ? [] : ["Es fehlt ein Primärtext."]),
    ...(set.titles.some((t) => t.trim()) ? [] : ["Es fehlt eine Überschrift."]),
    ...(needsSecondText(set)
      ? [
          "Es braucht einen zweiten Text oder eine zweite Überschrift — Meta lehnt eine UGC-Anzeige mit nur je einem ab.",
        ]
      : []),
  ];
}

/**
 * Was Schritt 1 offen lässt. Der beworbene Kunde steht nicht hier: ob ein Name
 * eine Seite hat, weiß nur der Wizard – er hat die Kundenliste.
 */
export function customerBlockers(state: WizardState): string[] {
  return state.adAccount ? [] : ["Es ist kein Werbekonto gewählt."];
}

/** Was Schritt 3 offen lässt – Name und Zahlen. */
export function detailBlockers(state: WizardState): string[] {
  return [
    ...(state.campaignName.trim() ? [] : ["Der Kampagnenname ist leer."]),
    ...(state.dailyBudgetEuros >= 1 ? [] : ["Das Tagesbudget muss mindestens 1 € betragen."]),
    ...(state.spendCapEuros !== undefined && state.spendCapEuros < 100
      ? ["Das Ausgabenlimit muss mindestens 100 € betragen."]
      : []),
  ];
}

/**
 * Der wartende Anlegen-Knopf: solange etwas läuft oder im Eingang liegt, wird
 * gewartet. Danach wird nur angelegt, wenn nichts scheiterte und nichts offen
 * ist – sonst abgebrochen, nie halb.
 */
export function queuedLaunch(
  uploads: { running: number; arriving: boolean; failed: number },
  blocked: boolean,
): "wait" | "create" | "abort" {
  if (uploads.running || uploads.arriving) return "wait";
  return uploads.failed || blocked ? "abort" : "create";
}

export function reviewStatus(issues: readonly number[]) {
  return {
    ready: issues.filter((count) => count === 0).length,
    total: issues.length,
    open: issues.reduce((sum, count) => sum + count, 0),
  };
}

/**
 * Entwürfe liegen in localStorage, der Zeiger auf den gerade bearbeiteten in
 * sessionStorage. Diese Trennung ist der ganze Trick:
 *
 * - localStorage überlebt den geschlossenen Tab und den Neustart des Rechners.
 *   Ein halbfertiger Entwurf ist damit nicht mehr weg, nur weil jemand das
 *   falsche Fenster geschlossen hat – vorher war er das.
 * - Der Zeiger gilt nur für diesen Tab. Zwei offene Assistenten arbeiten
 *   dadurch an zwei Entwürfen nebeneinander, statt sich unter einem einzigen
 *   Schlüssel gegenseitig zu überschreiben.
 *
 * Immer noch keine Datenbank: der Entwurf gehört der Person, die ihn tippt, und
 * die hochgeladenen Dateien liegen ohnehin schon im Werbekonto.
 */
const DRAFTS_KEY = "medarbeiter:new-campaign:drafts:v2";
const CURRENT_KEY = "medarbeiter:new-campaign:current";
/** Mehr hebt niemand auf; der älteste fällt hinten heraus. */
const MAX_DRAFTS = 10;

export type Draft = { id: string; savedAt: number; state: WizardState };

/**
 * Ab der zweiten Änderung wird gespeichert. Nicht danach gefragt, *was* sich
 * geändert hat: jede Eingabe ist Arbeit, und welche davon es wert ist, kann nur
 * die Person entscheiden, die sie gemacht hat. Die zwei halten allein den
 * Fehlgriff heraus – einmal ins Formular gefasst und weitergeklickt legt noch
 * keinen Entwurf an, sonst bestünde die Liste binnen einer Woche aus
 * Karteileichen.
 */
const MIN_CHANGES = 2;

/**
 * Ein Entwurf, den es schon gibt, wird ab sofort bei *jeder* Änderung
 * geschrieben – die zwei Änderungen sind die Hürde, einen anzulegen, nicht eine,
 * die bei jedem Fortsetzen neu zu nehmen wäre. Ohne diese Hälfte ginge die erste
 * Änderung an einem fortgesetzten Entwurf verloren.
 */
export const shouldSave = (changes: number, hasDraft: boolean): boolean =>
  hasDraft || changes >= MIN_CHANGES;

/** Woran ein Entwurf in der Liste wiederzuerkennen ist. */
export const draftLabel = (draft: Draft): string =>
  draft.state.campaignName.trim() ||
  draft.state.business.trim() ||
  // Vor der Aufgabenwahl getippte Hinweise sind schon ein Entwurf – er
  // heißt nach ihrer ersten Zeile, nicht „Ohne Kunde“.
  (draft.state.aiNotes ?? "").trim().split("\n")[0].trim() ||
  "Ohne Kunde";

/** Wie viel Arbeit in einem Entwurf steckt – die zweite Zeile in der Liste. */
export const draftSummary = (draft: Draft): string => {
  const ads = draft.state.adSets.reduce((n, s) => n + s.ads.length, 0);
  const sets = draft.state.adSets.length;
  return `${sets === 1 ? "1 Standort" : `${sets} Standorte`} · ${ads === 1 ? "1 Anzeige" : `${ads} Anzeigen`}`;
};

/**
 * Der berührte Entwurf nach vorn, der älteste hinten heraus. Die Liste ist
 * damit immer nach zuletzt bearbeitet sortiert, ohne dass irgendwer sortiert.
 */
export const upsertDraft = (drafts: Draft[], draft: Draft): Draft[] =>
  [draft, ...drafts.filter((d) => d.id !== draft.id)].slice(0, MAX_DRAFTS);

/**
 * Gelesen wird bei jedem Schreiben neu, statt einen Stand im Speicher zu halten:
 * ein zweiter Tab hat die Liste vielleicht gerade geändert, und dessen Entwurf
 * darf nicht verschwinden, weil dieser Tab noch den Stand von vorhin kennt.
 */
const readDrafts = (): Draft[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as Draft[];
    // Ein kaputter Eintrag ist kein Grund, die Seite nicht zu zeigen.
    return Array.isArray(parsed) ? parsed.filter((d) => d?.id && d?.state?.adSets) : [];
  } catch {
    return [];
  }
};

const writeDrafts = (drafts: Draft[]) => {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Voller oder gesperrter localStorage darf das Tippen nicht aufhalten.
  }
};

/** Vor dem Kampagnenkontext trug jedes Feld genau eine Quelle – jetzt eine Liste. */
const sourcesOf = (sources: Sources | undefined): Sources =>
  Object.fromEntries(
    Object.entries(sources ?? {}).map(([field, v]) => [field, Array.isArray(v) ? v : [v as unknown as Source]]),
  );

/** Ein gespeicherter Stand kann aus einer älteren Fassung stammen – siehe KEY. */
export const hydrate = (state: WizardState, initials: string): WizardState => ({
  ...state,
  initials: state.initials || initials,
  benefits: state.benefits ?? "",
  sources: sourcesOf(state.sources),
  aiNotes: state.aiNotes ?? "",
  copyInstructions: state.copyInstructions ?? "",
  adSets: state.adSets.map((s) => ({
    ...s,
    id: s.id ?? crypto.randomUUID(),
    ads: s.ads ?? [],
    loose: s.loose ?? [],
  })),
});

export function useWizardState(defaults: WizardState) {
  const [state, setState] = useState<WizardState>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // Ein von selbst wiederhergestellter Entwurf ändert Felder, ohne dass jemand
  // tippt – das gehört gesagt. Ein bewusst aus der Liste geholter nicht.
  const [restored, setRestored] = useState(false);
  // Der Entwurf, an dem dieser Tab arbeitet. Erst gesetzt, wenn es etwas zu
  // speichern gibt: ein bloß geöffneter Assistent ist noch kein Entwurf.
  const current = useRef<string>(undefined);
  // Wie oft sich der Stand seit dem Ausgangsstand geändert hat, und welcher
  // Stand zuletzt gezählt wurde. Der zweite Ref ist nicht bloß Buchhaltung: im
  // Strict Mode läuft der Effekt zweimal mit demselben Objekt, und ohne ihn
  // wäre eine Änderung sofort zwei.
  const changes = useRef(0);
  const counted = useRef<WizardState>(undefined);

  // Zurück auf Anfang zählen – nach jedem Weg, der das Formular leert oder den
  // Entwurf aus der Hand gibt. Sonst zählte das Leeren selbst als Änderung und
  // der nächste Tastendruck legte schon wieder einen Entwurf an.
  const rebase = () => {
    changes.current = 0;
    counted.current = undefined;
  };

  useEffect(() => {
    let all = readDrafts();

    // Einmalige Übernahme des alten Einzelentwurfs aus dem sessionStorage. Wer
    // beim Aufspielen dieser Fassung gerade mitten in einer Kampagne stand,
    // findet sie danach in der Liste wieder, statt vor einem leeren Formular
    // zu sitzen.
    const legacy = sessionStorage.getItem(KEY);
    if (legacy) {
      sessionStorage.removeItem(KEY);
      try {
        const id = crypto.randomUUID();
        all = upsertDraft(all, { id, savedAt: Date.now(), state: JSON.parse(legacy) as WizardState });
        writeDrafts(all);
        sessionStorage.setItem(CURRENT_KEY, id);
      } catch {
        // kaputter Entwurf ist kein Grund, die Seite nicht zu zeigen
      }
    }

    // Fehlt der Zeiger (neuer Tab, Neustart) oder zeigt er auf einen Entwurf,
    // den ein anderer Tab gelöscht hat, beginnt dieser Tab leer – die Liste
    // steht trotzdem zur Auswahl.
    const mine = all.find((d) => d.id === sessionStorage.getItem(CURRENT_KEY));
    if (mine) {
      current.current = mine.id;
      setState(hydrate(mine.state, defaults.initials));
      setRestored(true);
    } else {
      setState((s) => ({ ...s, initials: defaults.initials }));
    }
    setDrafts(all);
    setLoaded(true);
    // deps: defaults.initials – defaults sind je Seitenaufruf stabil, deshalb reicht []
  }, []);

  useEffect(() => {
    if (!loaded) return;

    // Der erste Lauf nach dem Laden ist keine Änderung, sondern der Stand, an
    // dem die Zählung beginnt.
    if (counted.current === undefined) {
      counted.current = state;
      return;
    }
    if (counted.current === state) return;
    counted.current = state;
    changes.current += 1;
    if (!shouldSave(changes.current, Boolean(current.current))) return;

    const id = (current.current ??= crypto.randomUUID());
    sessionStorage.setItem(CURRENT_KEY, id);
    const next = upsertDraft(readDrafts(), { id, savedAt: Date.now(), state });
    writeDrafts(next);
    setDrafts(next);
  }, [state, loaded]);

  /**
   * Sofort speichern, ohne die Zwei-Änderungen-Hürde – der Knopf im Assistenten.
   * Danach zählt der Tab als Entwurf und jede weitere Änderung speichert von
   * selbst (shouldSave mit hasDraft=true).
   */
  const save = () => {
    const id = (current.current ??= crypto.randomUUID());
    sessionStorage.setItem(CURRENT_KEY, id);
    const next = upsertDraft(readDrafts(), { id, savedAt: Date.now(), state });
    writeDrafts(next);
    setDrafts(next);
  };

  /** Diesen Tab von vorn beginnen lassen; der bisherige Entwurf bleibt liegen. */
  const detach = () => {
    current.current = undefined;
    sessionStorage.removeItem(CURRENT_KEY);
    setRestored(false);
    rebase();
  };

  /**
   * Mit einem fertigen Stand beginnen – der Vorlage einer duplizierten oder zu
   * bearbeitenden Kampagne. Der bisherige Entwurf dieses Tabs bleibt in der
   * Liste liegen; gezählt wird von vorn, sodass die erste Änderung an der
   * Vorlage noch keinen Entwurf anlegt, die zweite schon.
   */
  const start = (next: WizardState) => {
    detach();
    setState(next);
  };

  /** Einen Entwurf aus der Liste in diesen Tab holen. */
  const resume = (id: string) => {
    const found = readDrafts().find((d) => d.id === id);
    if (!found) return;
    current.current = id;
    sessionStorage.setItem(CURRENT_KEY, id);
    setState(hydrate(found.state, state.initials));
    // Bewusst geholt – der Hinweis auf einen unbemerkt wiederhergestellten
    // Entwurf wäre hier Lärm.
    setRestored(false);
  };

  /** Wegwerfen. War es der eigene, steht der Assistent danach leer da. */
  const remove = (id: string) => {
    const next = readDrafts().filter((d) => d.id !== id);
    writeDrafts(next);
    setDrafts(next);
    if (current.current !== id) return;
    detach();
    setState({ ...defaults, initials: state.initials });
  };

  /**
   * Beiseitelegen statt wegwerfen: „Andere Aufgabe“ mitten in der Arbeit.
   * Steckt schon etwas im Entwurf, wird er gespeichert und bleibt in der
   * Liste; der Tab beginnt leer. Ohne Arbeit ist es ein discard.
   */
  const park = () => {
    if (!hasWork(state)) return discard();
    save();
    detach();
    setState({ ...defaults, initials: state.initials });
  };

  /**
   * Der Knopf am Hinweis „Entwurf wiederhergestellt“: wegwerfen und von vorn.
   * Leer wird das Formular auch dann, wenn es (noch) keinen gespeicherten
   * Entwurf dazu gibt – sonst bliebe der Knopf ohne sichtbare Wirkung.
   */
  const discard = () => {
    if (current.current) return remove(current.current);
    detach();
    setState({ ...defaults, initials: state.initials });
  };

  /**
   * Nach dem Anlegen hat der Entwurf seinen Zweck erfüllt: die Kampagne steht
   * bei Meta, und in der Liste wäre er ab jetzt eine Einladung, sie ein zweites
   * Mal anzulegen. Das Formular bleibt stehen – daneben steht die Quittung.
   *
   * Die Zählung beginnt dabei von vorn (detach → rebase): wer nach dem Anlegen
   * weiterarbeitet, braucht wieder zwei Änderungen für einen neuen Entwurf – und
   * das ist ab da auch einer, nämlich der für die nächste Kampagne.
   */
  const forget = () => {
    const id = current.current;
    if (!id) return;
    detach();
    const next = readDrafts().filter((d) => d.id !== id);
    writeDrafts(next);
    setDrafts(next);
  };

  // `loaded` nach außen, weil es vor dem Wiederherstellen keine gültigen
  // Anzeigengruppen-IDs gibt: ein fertiger Upload, der in diesem Moment
  // zugestellt würde, fände nur die frisch erzeugte leere Gruppe und wäre weg.
  //
  // `others`: der eigene Entwurf gehört nicht in die Liste zum Fortsetzen – er
  // steht ja schon offen auf dem Bildschirm.
  return {
    state,
    setState,
    loaded,
    restored,
    others: drafts.filter((d) => d.id !== current.current),
    save,
    start,
    resume,
    remove,
    discard,
    park,
    forget,
  };
}
