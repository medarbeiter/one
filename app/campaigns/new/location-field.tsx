"use client";

import form from "./campaign-form.module.css";

/**
 * Standort einer Anzeigengruppe: entweder ein Ort aus Metas Verzeichnis (Stadt,
 * PLZ, Bezirk) oder eine getippte Adresse mit Umkreis.
 *
 * Warum beides in einem Feld statt zwei Feldern mit Umschalter: es ist eine
 * Frage – "wo soll das laufen?" – und die Antwort ist mal eine Stadt und mal
 * eine Straße. Zwei Felder hätten bedeutet, dass immer eines leer und falsch
 * aussieht.
 *
 * Straßen schlägt Meta nicht vor (sein Verzeichnis endet beim Stadtteil), also
 * bleibt das Feld für freien Text offen. Was dabei herauskommt, prüft die
 * Reichweitenschätzung: findet Meta die Adresse nicht, kommt keine Zahl zurück
 * und genau das steht dann unter dem Feld – vor dem Start, nicht danach.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Slider,
  Spinner,
  Text,
  Typeahead,
  type SearchSource,
  type SearchableItem,
} from "@astryxdesign/core";
import {
  fitRadius,
  formatReach,
  locationProblem,
  pinLabel,
  placeContext,
  placeTextValue,
  radiusRange,
  reachAdvice,
  type GeoPin,
  type GeoPlace,
  type LocationInput,
} from "@/lib/geo";
import type { Reach } from "@/lib/geo-search";
import { geocodeAction, reachAction, reverseGeocodeAction, searchPlacesAction } from "../actions";
import mapStyles from "./location-map.module.css";

/**
 * Die Karte kommt erst mit dem Standort, nicht mit der Seite: MapLibre wiegt
 * 250 kB und braucht WebGL – nichts davon gehört in den ersten Schirm.
 */
const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => <div className={mapStyles.skeleton} aria-hidden />,
});

export type LocationValue = LocationInput;

/** Tippen ist schneller als das Netz – ohne Wartezeit ginge jeder Buchstabe als
 *  eigener Aufruf gegen Metas Limit. Der Typeahead debounct selbst damit. */
const SEARCH_DELAY_MS = 250;
/** Die Schätzung darf träger sein als die Vorschläge: sie ändert sich auch beim
 *  Ziehen am Radius, und dort will niemand zehn Zwischenstände sehen. */
const REACH_DELAY_MS = 600;

/** Ein Treffer aus Metas Ortsverzeichnis – oder der gesetzte Pin – als Token im Typeahead. */
type PlaceItem = SearchableItem<GeoPlace | GeoPin> & { auxiliaryData: GeoPlace | GeoPin };

const isPlace = (x: GeoPlace | GeoPin): x is GeoPlace => "key" in x;

const toPlaceItem = (place: GeoPlace): PlaceItem => ({
  id: place.key,
  label: placeTextValue(place),
  auxiliaryData: place,
});

/** Der Pin steht im Feld wie ein gewählter Ort: als Token mit ×, nicht als Text zum Verstolpern. */
const toPinItem = (pin: GeoPin, label: string): PlaceItem => ({ id: "pin", label, auxiliaryData: pin });

/** Wonach die Karte einen Ort aus Metas Verzeichnis sucht – Name plus Stadt oder Land gegen Verwechslung. */
const placeQuery = (p: GeoPlace) => [p.name, p.primaryCity ?? p.region].filter(Boolean).join(", ");

/** Zoom ohne Umkreis: ein Bundesland braucht Abstand, ein Stadtteil Nähe. */
const ZOOM: Record<GeoPlace["type"], number> = { region: 7, city: 10, zip: 12, subcity: 12, neighborhood: 13 };

/**
 * Ortssuche über Metas Verzeichnis. Der Typeahead ruft search() selbst
 * verzögert auf – ein eigenes Debounce hier bräuchte es nicht mehr.
 */
const placeSearchSource: SearchSource<PlaceItem> = {
  async search(query) {
    const q = query.trim();
    // Unter zwei Zeichen bringt Meta noch keine brauchbaren Treffer – und das
    // schont das Limit gegenüber einem Aufruf pro Tastendruck.
    if (q.length < 2) return [];
    const found = await searchPlacesAction(q);
    return found.map(toPlaceItem);
  },
  bootstrap: () => [],
};

/**
 * Ein verzögerter Wert – und ein Zähler, an dem sich veraltete Antworten
 * erkennen lassen. Ohne den überschriebe die langsame Antwort auf "Ham" die
 * schnelle auf "Hamburg".
 */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}

export function LocationField({
  value,
  onChange,
  adAccount,
}: {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  adAccount: string;
}) {
  // Was im Feld steht, kommt aus dem Entwurf, nicht aus einem zweiten Zustand
  // hier: sonst zeigte das Feld nach dem Wiederherstellen einer gespeicherten
  // Kampagne den alten Text und der Entwurf den neuen.
  const inputValue = value.place ? placeTextValue(value.place) : value.addressString;
  const range = radiusRange(value.place);

  const reach = useReach(adAccount, value);
  const center = useMapCenter(value);
  const latestPin = useRef(value.pin);
  latestPin.current = value.pin;

  /**
   * Ein Klick auf die Karte: der Pin gilt sofort, mit Koordinaten im Feld, und
   * der Name kommt nach – Meta bekommt ohnehin die Koordinate, der Name ist
   * nur für den, der das Feld liest.
   */
  const placePin = (pin: GeoPin) => {
    onChange({ pin, place: undefined, addressString: pinLabel(pin), radiusKm: fitRadius(value.radiusKm) });
    void reverseGeocodeAction(pin).then((label) => {
      // Nur, wenn der Pin inzwischen nicht weitergewandert ist.
      if (label && latestPin.current === pin) onChange({ addressString: label });
    });
  };

  return (
    <div className="space-y-4">
      <div className={form.fieldGrid}>
        <Typeahead
          label="Standort"
          isRequired
          // Der Platzhalter ist nur sichtbar, solange kein Ort ausgewählt ist –
          // genau dann, wenn eine getippte, noch nicht bei Meta gefundene
          // Adresse in addressString stecken kann (z. B. aus einer anderen
          // Anzeigengruppe übernommen). Sie steckt weiter im Entwurf und wird
          // mit abgeschickt; der Typeahead kann sein Eingabefeld nur nicht von
          // außen vorbelegen. Der Platzhalter ist die einzige Stelle, an der
          // sie trotzdem sichtbar wird – nicht vereinfachen.
          placeholder={
            value.place
              ? "Stadt, PLZ oder Musterstraße 1, 12345 Musterstadt"
              : value.addressString || "Stadt, PLZ oder Musterstraße 1, 12345 Musterstadt"
          }
          searchSource={placeSearchSource}
          debounceMs={SEARCH_DELAY_MS}
          value={
            value.place
              ? toPlaceItem(value.place)
              : value.pin
                ? toPinItem(value.pin, value.addressString || pinLabel(value.pin))
                : null
          }
          onChange={(item) => {
            // Aus der Liste kommt nur ein Ort – der Pin steht nie drin.
            if (item && isPlace(item.auxiliaryData)) {
              const place = item.auxiliaryData;
              onChange({
                place,
                pin: undefined,
                addressString: placeTextValue(place),
                radiusKm: fitRadius(value.radiusKm, place),
              });
              return;
            }
            if (item) return;
            // Explizites Leeren über das × am Token.
            onChange({ place: undefined, pin: undefined, addressString: "" });
          }}
          onChangeQuery={(text) => {
            // Der eingetippte Text ist wieder eine Adresse – der zuvor gewählte
            // Ort darf nicht still stehen bleiben, sonst zielt die Kampagne auf
            // die Stadt, während im Feld eine Straße steht. Beim Eintritt in den
            // Bearbeiten-Modus meldet der Typeahead einmalig genau inputValue –
            // das ist kein Tippen, sondern nur das Sichtbarmachen des Werts.
            if (text !== inputValue) onChange({ addressString: text, place: undefined, pin: undefined });
          }}
          emptySearchResultsText="Kein Ort bei Meta gefunden. Die Eingabe zählt dann als Adresse."
          renderItem={(item) => {
            const place = item.auxiliaryData;
            if (!isPlace(place)) return item.label;
            return (
              <div className="flex flex-col">
                <Text type="label" as="div">
                  {place.name}
                </Text>
                <Text type="supporting" as="div">
                  {placeContext(place)}
                </Text>
              </div>
            );
          }}
        />

        {/* Ein Ort ohne Radius bekommt auch kein Radiusfeld. Meta verwirft den
            Wert bei einer PLZ still und liefert für einen Bezirk mit Radius gar
            keine Zielgruppe mehr – ein Feld, das nichts bewirkt, wäre schlimmer
            als keines. */}
        {range ? (
          // Ein Schieber statt eines Zahlenfelds: die Grenzen sind damit sichtbar,
          // statt erst beim Tippen aufzufallen, und ein Wert außerhalb lässt sich
          // gar nicht erst einstellen.
          <Slider
            label="Radius"
            value={value.radiusKm}
            // Nur weitergeben, was sich wirklich ändert: am Anschlag meldet der
            // Schieber jeden Tastendruck erneut mit demselben Wert, und jede
            // dieser Meldungen schriebe sonst den Entwurf neu. Gedrückt
            // gehaltene Pfeiltaste am Rand hat React so schon in die
            // Update-Tiefenbegrenzung getrieben.
            onChange={(radiusKm: number) => radiusKm !== value.radiusKm && onChange({ radiusKm })}
            min={range.min}
            max={range.max}
            step={1}
            formatValue={(km) => `${km} km`}
            valueDisplay="text"
            description={
              value.place
                ? `Meta erlaubt ${range.min} bis ${range.max} km um eine Stadt.`
                : `Meta erlaubt ${range.min} bis ${range.max} km um die Adresse.`
            }
          />
        ) : (
          <div className="space-y-1">
            <Text type="label" as="div">
              Radius
            </Text>
            <Text type="supporting" as="div">
              Kein Umkreis: {value.place?.name} ist bei Meta ein fester Bereich, kein Punkt auf der
              Karte.
            </Text>
          </div>
        )}
      </div>

      {/* Die Karte ist die Antwort auf „wo genau?“ – der Text im Feld sagt das
          nur dem, der die Adresse kennt. Klick setzt den Pin, der Kreis ist
          der Umkreis, den Meta bespielt. */}
      <LocationMap
        center={center}
        radiusKm={range ? value.radiusKm : undefined}
        zoom={value.place ? ZOOM[value.place.type] : undefined}
        onPin={placePin}
      />
      <Text type="supporting" as="div">
        Klick auf die Karte setzt den Standort als Pin, Ziehen verschiebt ihn.
        {range && " Der Kreis ist der Umkreis, in dem die Anzeigen laufen."}
      </Text>

      <ReachLine reach={reach} />
    </div>
  );
}

/**
 * Wo die Karte hinschaut. Ein Pin ist selbst der Punkt; Ort und Adresse
 * sucht Photon (lib/geocode.ts) – verzögert wie die Reichweite, und der
 * letzte Fund bleibt stehen, bis der nächste da ist. Sonst spränge die Karte
 * bei jedem Tastendruck nach Deutschland zurück.
 */
function useMapCenter(value: LocationValue): GeoPin | undefined {
  const query = value.pin ? "" : value.place ? placeQuery(value.place) : value.addressString.trim();
  const settled = useDebounced(query, REACH_DELAY_MS);
  const [found, setFound] = useState<GeoPin | undefined>();

  useEffect(() => {
    if (settled.length < 3) {
      setFound(undefined);
      return;
    }
    let current = true;
    void geocodeAction(settled).then((pin) => {
      if (current) setFound(pin);
    });
    return () => {
      current = false;
    };
  }, [settled]);

  return value.pin ?? (query ? found : undefined);
}

type ReachState = { loading: true } | { loading: false; reach: Reach | { error: string } } | null;

/**
 * Die Reichweite zu dem, was gerade im Feld steht. Bewusst am selben Ort
 * berechnet, an dem später gebucht wird (lib/geo.ts baut beide geo_locations) –
 * eine Zahl für ein anderes Targeting als das gebuchte wäre schlimmer als keine.
 */
function useReach(adAccount: string, value: LocationValue): ReachState {
  const [state, setState] = useState<ReachState>(null);
  // Der Ort steckt in einem Objekt; ohne diesen Schlüssel liefe der Effekt bei
  // jedem Tastendruck neu, weil das Objekt jedes Mal ein neues ist.
  // Beim Pin zählt die Koordinate, nicht der Name, der ihr nachkommt – sonst
  // fragte die Schätzung zweimal nach demselben Targeting.
  const key = JSON.stringify([
    adAccount,
    value.place?.key ?? (value.pin ? `${value.pin.lat},${value.pin.lng}` : value.addressString.trim()),
    value.radiusKm,
  ]);
  const settled = useDebounced(key, REACH_DELAY_MS);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const [account, where] = JSON.parse(settled) as [string, string, number];
    if (!account || !where || locationProblem(latest.current)) {
      setState(null);
      return;
    }
    let current = true;
    setState({ loading: true });
    reachAction(account, {
      addressString: latest.current.addressString,
      radiusKm: latest.current.radiusKm,
      place: latest.current.place,
      pin: latest.current.pin,
    }).then((reach) => {
      if (current) setState({ loading: false, reach });
    });
    return () => {
      current = false;
    };
  }, [settled]);

  return state;
}

function ReachLine({ reach }: { reach: ReachState }) {
  if (!reach) return null;
  if (reach.loading)
    return (
      <Text type="supporting" as="div" className="flex items-center gap-2">
        <Spinner size="sm" />
        Zielgruppe wird bei Meta geprüft…
      </Text>
    );

  const r = reach.reach;
  if ("error" in r)
    return (
      <Text type="supporting" as="div" className="text-danger-700">
        {r.error}
      </Text>
    );
  // Keine Zahl heißt bei Meta nicht "null Menschen", sondern "den Ort gibt es
  // so nicht". Genau das gehört hier hin – vor dem Start ist es ein Tippfehler,
  // nach dem Start eine Anzeigengruppe, die nie ausgeliefert wird.
  if (!r.ready)
    return (
      <Text type="supporting" as="div" className="text-warning-700">
        Meta findet zu dieser Angabe keine Zielgruppe. Prüfe die Schreibweise, oder wähle einen Ort
        aus der Liste.
      </Text>
    );

  // Eine Zahl allein sagt niemandem, ob sie reicht. Der Hinweis steht deshalb
  // direkt darunter und nur dann, wenn er etwas zu sagen hat.
  const advice = reachAdvice(r.upper);

  return (
    <div className="space-y-1">
      <Text type="supporting" as="div">
        Zielgruppe bei Meta:{" "}
        <strong className="text-ink-900">{formatReach(r.lower, r.upper)}</strong> monatlich aktive
        Menschen. Eine Spanne, keine Zusage — Meta rundet grob.
      </Text>
      {advice && (
        <Text type="supporting" as="div" className="text-warning-700">
          {advice}
        </Text>
      )}
    </div>
  );
}
