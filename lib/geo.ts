/**
 * Orte aus Metas eigenem Verzeichnis (`type=adgeolocation`) – die Alternative zur
 * getippten Adresse.
 *
 * Der Unterschied ist keine Kosmetik: eine Adresse geocodiert Meta erst beim
 * Anlegen der Anzeigengruppe, und ein Tippfehler fällt dort als leere Zielgruppe
 * auf, nicht als Fehler. Ein Ort trägt dagegen einen Schlüssel aus Metas
 * Verzeichnis – der kann gar nicht danebenliegen.
 *
 * Alle Grenzen und Zuordnungen hier sind gegen act_<ID>/delivery_estimate
 * gemessen, nicht aus der Doku abgeschrieben.
 */

export type GeoPlaceType = "city" | "zip" | "region" | "subcity" | "neighborhood";

export type GeoPlace = {
  type: GeoPlaceType;
  key: string;
  name: string;
  /** Bundesland – ohne das sind "Altona" in Hamburg und "Altona" in
   *  Sachsen-Anhalt in der Vorschlagsliste nicht zu unterscheiden. */
  region?: string;
  /** Nur bei PLZ: die Stadt, zu der sie gehört. */
  primaryCity?: string;
};

/** Welcher Topf in `geo_locations` welchen Typ aufnimmt. */
const BUCKET = {
  city: "cities",
  zip: "zips",
  region: "regions",
  subcity: "subcities",
  neighborhood: "neighborhoods",
} as const satisfies Record<GeoPlaceType, keyof GeoLocations>;

const KIND: Record<GeoPlaceType, string> = {
  city: "Stadt",
  zip: "PLZ",
  region: "Bundesland",
  subcity: "Bezirk",
  neighborhood: "Stadtteil",
};

/**
 * Nur Städte nehmen einen Radius an. Gemessen: eine PLZ mit radius liefert exakt
 * dieselbe Reichweite wie ohne (Meta verwirft das Feld still), ein Stadtteil mit
 * radius liefert 0 ohne estimate_ready. Einen Radius anzubieten, den Meta
 * wegwirft, wäre die schlimmere Variante – der Bediener glaubte, er hätte den
 * Umkreis gesetzt.
 */
export const supportsRadius = (type: GeoPlaceType) => type === "city";

/**
 * Metas Grenzen, an der Kante abgetastet. Für Städte liegt die Untergrenze bei
 * 16 km (10 Meilen): 15 km liefert 0 ohne estimate_ready, 16 km liefert eine
 * Zahl. Für Adressen gilt 1–80 km, 81 km fällt durch.
 */
export const RADIUS_KM = {
  address: { min: 1, max: 80 },
  city: { min: 16, max: 80 },
} as const;

export const radiusRange = (place?: GeoPlace) =>
  place ? (supportsRadius(place.type) ? RADIUS_KM.city : undefined) : RADIUS_KM.address;

/**
 * Ein Radius, den der neue Ort auch annimmt. Wer 5 km um eine Adresse eingestellt
 * hatte und dann die Stadt wählt, bekäme sonst eine Anzeigengruppe ohne
 * Zielgruppe – Meta liefert unter 16 km um eine Stadt gar nichts mehr aus.
 */
export function fitRadius(current: number, place?: GeoPlace): number {
  const range = radiusRange(place);
  if (!range) return current;
  return Math.min(range.max, Math.max(range.min, current));
}

/** Der Ortsname allein – die Zeile, die in der Vorschlagsliste vorne steht. */
export const placeLabel = (p: GeoPlace) => p.name;

/** Woran man zwei gleichnamige Orte auseinanderhält. */
export const placeContext = (p: GeoPlace) =>
  [KIND[p.type], p.primaryCity, p.region].filter(Boolean).join(" · ");

/** Was im Eingabefeld steht, wenn der Ort gewählt ist – und wonach gefiltert wird. */
export const placeTextValue = (p: GeoPlace) => `${p.name} (${placeContext(p)})`;

/** Ein Ort im Targeting: entweder ein Schlüssel aus Metas Verzeichnis, ggf. mit
 *  Radius, oder eine Adresse, die Meta selbst geocodiert. */
type KeyedLocation = { key: string; radius?: number; distance_unit?: "kilometer" };
type AddressLocation = { address_string: string; radius: number; distance_unit: "kilometer" };

export type GeoLocations = {
  custom_locations?: AddressLocation[];
  cities?: KeyedLocation[];
  zips?: KeyedLocation[];
  regions?: KeyedLocation[];
  subcities?: KeyedLocation[];
  neighborhoods?: KeyedLocation[];
};

/**
 * Ein Eintrag aus Metas Suchantwort, so weit übernommen, wie wir ihn brauchen.
 * Unbekannte Typen fallen hier raus statt später als leere Zielgruppe aufzufallen.
 */
export function toGeoPlace(raw: unknown): GeoPlace | undefined {
  const r = raw as Record<string, unknown> | null;
  if (!r) return undefined;
  const type = String(r.type ?? "");
  if (!(type in BUCKET)) return undefined;
  const key = r.key === undefined || r.key === null ? "" : String(r.key);
  const name = typeof r.name === "string" ? r.name : "";
  if (!key || !name) return undefined;
  return {
    type: type as GeoPlaceType,
    key,
    name,
    ...(typeof r.region === "string" ? { region: r.region } : {}),
    ...(typeof r.primary_city === "string" ? { primaryCity: r.primary_city } : {}),
  };
}

/**
 * Der `geo_locations`-Block für Ort oder Adresse. Eine Stelle für beides, damit
 * das Targeting beim Anlegen und die Reichweitenschätzung nicht auseinanderlaufen
 * können – sonst zeigte der Assistent eine Zahl für etwas anderes, als er bucht.
 */
export function geoLocations(i: {
  addressString: string;
  radiusKm: number;
  place?: GeoPlace;
}): GeoLocations {
  if (i.place) {
    const bucket = BUCKET[i.place.type];
    const entry = supportsRadius(i.place.type)
      ? { key: i.place.key, radius: i.radiusKm, distance_unit: "kilometer" as const }
      : { key: i.place.key };
    return { [bucket]: [entry] };
  }
  return {
    custom_locations: [
      { address_string: i.addressString.trim(), radius: i.radiusKm, distance_unit: "kilometer" },
    ],
  };
}

/**
 * Was am Ort oder an der Adresse noch nicht stimmt – dieselbe Prüfung für das
 * Formular und für den Start, damit das Feld nichts durchlässt, was Meta ablehnt.
 */
export function locationProblem(i: {
  addressString: string;
  radiusKm: number;
  place?: GeoPlace;
}): string | undefined {
  if (!i.place && !i.addressString.trim())
    return "Für das Radius-Targeting ist eine genaue Adresse erforderlich.";
  const range = radiusRange(i.place);
  if (!range) return undefined;
  if (!(i.radiusKm >= range.min && i.radiusKm <= range.max))
    return `Radius muss zwischen ${range.min} und ${range.max} km liegen.`;
  return undefined;
}

/** Wie der Ort in Zusammenfassungen steht – eine Zeile, die ohne Nachschlagen trägt. */
export const locationSummary = (i: {
  addressString: string;
  radiusKm: number;
  place?: GeoPlace;
}) => {
  const where = i.place ? placeTextValue(i.place) : i.addressString || "Adresse fehlt";
  return radiusRange(i.place) ? `${where} · ${i.radiusKm} km` : where;
};

/**
 * Woran zwei Anzeigengruppen als "derselbe Ort" zu erkennen sind. Der Radius
 * zählt nicht mit: 17 und 25 km um dieselbe Adresse sind zwei Kreise um denselben
 * Punkt, keine zwei Zielgruppen.
 */
export const locationKey = (i: { addressString: string; place?: GeoPlace }): string =>
  i.place
    ? `${i.place.type}:${i.place.key}`
    : i.addressString.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Anzeigengruppen, die auf denselben Ort zielen. Meta lässt das zu, aber die
 * beiden bieten dann in derselben Auktion gegeneinander: der Preis je Lead
 * steigt, und zwar unauffällig – im Ads Manager sieht jede für sich normal aus.
 *
 * Ein Hinweis, keine Sperre. Zwei Gruppen am selben Ort können gewollt sein
 * (zwei Berufsgruppen, zwei Formulare) – nur soll es dann eine Entscheidung
 * gewesen sein und kein übersehener Doppelklick auf „Anzeigengruppe hinzufügen“.
 */
export function duplicateLocations(
  sets: { name: string; addressString: string; place?: GeoPlace }[],
): string[] {
  const byKey = new Map<string, string[]>();
  for (const set of sets) {
    const key = locationKey(set);
    // Eine leere Adresse ist kein gemeinsamer Ort, sondern zweimal nichts.
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), set.name]);
  }

  return [...byKey.values()]
    .filter((names) => names.length > 1)
    .map(
      (names) =>
        `${names.map((n) => `„${n}“`).join(" und ")} zielen auf denselben Ort — ` +
        `sie bieten dann bei Meta gegeneinander.`,
    );
}

/**
 * Ab wann eine Zielgruppe zu klein ist, um eine Lead-Kampagne zu tragen.
 *
 * Kein Wert von Meta: Meta liefert auch an 20.000 Menschen aus. Es ist der
 * Erfahrungswert aus dem eigenen Bestand – darunter wird der Lead teuer, weil
 * dieselben Menschen die Anzeige immer wieder sehen. Deshalb steht es als
 * Hinweis am Feld und nicht als Sperre vor dem Start.
 */
export const REACH_FLOOR = 50_000;

/** Gemessen an der Obergrenze: reicht schon die nicht, ist die Sache klar. */
export function reachAdvice(upper: number): string | undefined {
  if (upper >= REACH_FLOOR) return undefined;
  return (
    `Kleine Zielgruppe: unter ${formatReach(REACH_FLOOR, REACH_FLOOR)} Menschen wird der Lead ` +
    `erfahrungsgemäß teuer, weil dieselben Menschen die Anzeige immer wieder sehen. ` +
    `Ein größerer Radius oder ein zweiter Standort hilft.`
  );
}

/**
 * Was Meta nach dem Anlegen tatsächlich stehen hat – verglichen mit dem, was
 * geschickt wurde.
 *
 * Verglichen wird der Schlüssel, nicht der Text: `custom_locations` kommen
 * umgeschrieben zurück. Aus „Valentinskamp 40, 20355 Hamburg“ wird bei Meta
 * „40 Valentinskamp, Hamburg, Hamburg, Deutschland“, aus mancher Adresse sogar
 * nur „41 Deutschland“ – beide Male mit richtigen Koordinaten. Auf Textgleichheit
 * zu prüfen hieße, jede zweite Anzeigengruppe grundlos durchfallen zu lassen.
 *
 * Geprüft wird stattdessen, was still schiefgehen kann und Geld kostet: der
 * falsche Topf, ein fremder Schlüssel, ein verlorener Radius, eine Adresse ohne
 * Koordinaten – und ein Topf, den wir nie geschickt haben. Ein übrig gebliebenes
 * `countries: ["DE"]` sieht im Ads Manager unauffällig aus und streut das Budget
 * über die Republik.
 */
export function geoProblem(sent: GeoLocations, readBack: unknown): string | undefined {
  const got = (readBack ?? {}) as Record<string, unknown>;

  const address = sent.custom_locations?.[0];
  if (address) {
    const stored = (got.custom_locations as Record<string, unknown>[] | undefined)?.[0];
    if (!stored) return "die Adresse fehlt im Targeting";
    // Ohne Koordinaten hat Meta die Adresse nicht gefunden – die Anzeigengruppe
    // stünde dann auf einem Punkt, den niemand gesetzt hat.
    if (stored.latitude === undefined || stored.longitude === undefined)
      return "Meta hat die Adresse nicht auf Koordinaten gebracht";
    if (stored.radius !== address.radius)
      return `Radius ${stored.radius ?? "fehlt"} statt ${address.radius}`;
  }

  for (const [bucket, entries] of Object.entries(sent)) {
    if (bucket === "custom_locations") continue;
    const wanted = (entries as { key: string; radius?: number }[])[0];
    const stored = (got[bucket] as Record<string, unknown>[] | undefined)?.find(
      // Meta gibt Schlüssel mal als Zahl, mal als Zeichenkette zurück.
      (e) => String(e.key) === wanted.key,
    );
    if (!stored) return `${bucket} ${wanted.key} fehlt im Targeting`;
    if (stored.radius !== wanted.radius)
      return `Radius ${stored.radius ?? "fehlt"} statt ${wanted.radius ?? "keiner"}`;
  }

  const extra = Object.keys(got).filter(
    (bucket) => bucket !== "location_types" && !(bucket in sent),
  );
  if (extra.length) return `zusätzlich ${extra.join(", ")} im Targeting`;

  return undefined;
}

/**
 * Metas Reichweite ist eine Spanne über Monatsnutzer, keine Personenzahl – so
 * wird sie auch geschrieben. "1,3–1,5 Mio." statt "1.348.221": die zweite Zahl
 * behauptet eine Genauigkeit, die die erste gar nicht hat.
 */
export function formatReach(lower: number, upper: number): string {
  // Die Einheit steht einmal hinter der Spanne, nicht an jeder Zahl – sonst
  // liest man "1,3 Mio.–1,5 Mio." und zählt zwei Angaben statt einer.
  const millions = upper >= 1_000_000;
  const fmt = (n: number) =>
    millions
      ? (n / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })
      : n.toLocaleString("de-DE");
  const span = lower === upper ? fmt(lower) : `${fmt(lower)}–${fmt(upper)}`;
  return millions ? `${span} Mio.` : span;
}
