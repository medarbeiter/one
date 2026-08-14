"use client";

import { useEffect, useState } from "react";
import { adSetName } from "@/lib/naming";
import { locationProblem } from "@/lib/geo";
import { nextCreativeName, normalizeAdName, planAds, uniqueName } from "@/lib/media";
import type { AdInput, AdSetInput, FormatAsset } from "@/lib/launch";
import type { Orientation } from "@/lib/media";

// v3: davor hieß das Feld der Anzeigengruppe `videos` – eine flache Dateiliste,
// eine Anzeige je Datei. Auf `ads` lässt sich das nicht abbilden, ohne Paarungen
// zu erfinden, die niemand bestätigt hat. Wie schon bei v1→v2 heißt der neue
// Schlüssel: alter Entwurf wird ignoriert statt halb wiederhergestellt.
const KEY = "medarbeiter:new-campaign:v3";

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
  dailyBudgetEuros: 17,
  adSets: [emptyAdSet(0)],
});

/** Ohne die UI-Felder (id, orientation), die auf dem Weg zu Meta nichts verloren haben. */
const toFormatAsset = (a: WizardAsset): FormatAsset =>
  a.kind === "video"
    ? { kind: "video", videoId: a.videoId, thumbnailUrl: a.thumbnailUrl, fileName: a.fileName }
    : { kind: "image", hash: a.hash, fileName: a.fileName };

/** Der Teil einer WizardAd, den lib/launch.ts kennt – ohne UI-Felder. */
export function toAdInput(ad: WizardAd): AdInput {
  if (ad.type === "ugc")
    return {
      name: ad.name,
      type: "ugc",
      asset: toFormatAsset(ad.asset) as Extract<FormatAsset, { kind: "video" }>,
    };
  if (ad.type === "single")
    return {
      name: ad.name,
      type: "single",
      asset: toFormatAsset(ad.asset) as Extract<FormatAsset, { kind: "image" }>,
    };
  return {
    name: ad.name,
    type: "split",
    portrait: toFormatAsset(ad.portrait),
    square: toFormatAsset(ad.square),
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
export function syncLinkedAds(adSets: WizardAdSet[]): WizardAdSet[] {
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
  const { ads: planned, unpaired } = planAds([...set.loose, ...arrived]);
  const taken = new Set(set.ads.map((a) => a.name));

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

  return { ads: [...set.ads, ...fresh], loose: unpaired };
}

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
  return { ads: [...set.ads, { id, name: nextCreativeName(taken), type: "single", asset }], loose };
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

// Initialen sind pro Person und ändern sich nie – wer sie einmal gewählt hat,
// soll sie nicht bei jeder Kampagne erneut suchen. Deshalb localStorage (bleibt
// über Tabs und Tage) statt sessionStorage (stirbt mit dem Entwurf).
const INITIALS_KEY = "medarbeiter:initials";

// sessionStorage statt Datenbank: Der Entwurf muss nur einen Reload überleben,
// die hochgeladenen Dateien liegen ohnehin schon im Werbekonto.
export function useWizardState(defaults: WizardState) {
  const [state, setState] = useState<WizardState>(defaults);
  const [loaded, setLoaded] = useState(false);
  // Ein wiederhergestellter Entwurf ändert Felder, ohne dass jemand tippt –
  // das gehört gesagt, samt Weg zurück auf leer.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const initials = localStorage.getItem(INITIALS_KEY) ?? "";
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as WizardState;
        setState({
          ...parsed,
          initials: parsed.initials || initials,
          adSets: parsed.adSets.map((s) => ({
            ...s,
            id: s.id ?? crypto.randomUUID(),
            ads: s.ads ?? [],
            loose: s.loose ?? [],
          })),
        });
        setRestored(true);
      } catch {
        // kaputter Entwurf ist kein Grund, die Seite nicht zu zeigen
      }
    } else if (initials) {
      setState((s) => ({ ...s, initials }));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    sessionStorage.setItem(KEY, JSON.stringify(state));
    if (state.initials) localStorage.setItem(INITIALS_KEY, state.initials);
  }, [state, loaded]);

  const discard = () => {
    sessionStorage.removeItem(KEY);
    setState({ ...defaults, initials: state.initials });
    setRestored(false);
  };

  // `loaded` nach außen, weil es vor dem Wiederherstellen keine gültigen
  // Anzeigengruppen-IDs gibt: ein fertiger Upload, der in diesem Moment
  // zugestellt würde, fände nur die frisch erzeugte leere Gruppe und wäre weg.
  return { state, setState, loaded, restored, discard };
}
