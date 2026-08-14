"use client";

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
import {
  ComboBox,
  Description,
  Input,
  Label,
  ListBox,
  Slider,
  Spinner,
} from "@heroui/react";
import {
  fitRadius,
  formatReach,
  locationProblem,
  placeContext,
  placeTextValue,
  radiusRange,
  reachAdvice,
  type GeoPlace,
} from "@/lib/geo";
import type { Reach } from "@/lib/geo-search";
import { reachAction, searchPlacesAction } from "../actions";

export type LocationValue = {
  addressString: string;
  radiusKm: number;
  place?: GeoPlace;
};

/** Tippen ist schneller als das Netz – ohne Wartezeit ginge jeder Buchstabe als
 *  eigener Aufruf gegen Metas Limit. */
const SEARCH_DELAY_MS = 250;
/** Die Schätzung darf träger sein als die Vorschläge: sie ändert sich auch beim
 *  Ziehen am Radius, und dort will niemand zehn Zwischenstände sehen. */
const REACH_DELAY_MS = 600;

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebounced(query, SEARCH_DELAY_MS);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let current = true;
    setSearching(true);
    searchPlacesAction(q).then((found) => {
      if (!current) return;
      setResults(found);
      setSearching(false);
    });
    return () => {
      current = false;
    };
  }, [debouncedQuery]);

  // Was im Feld steht, kommt aus dem Entwurf, nicht aus einem zweiten Zustand
  // hier: sonst zeigte das Feld nach dem Wiederherstellen einer gespeicherten
  // Kampagne den alten Text und der Entwurf den neuen.
  const inputValue = value.place ? placeTextValue(value.place) : value.addressString;
  const range = radiusRange(value.place);

  const reach = useReach(adAccount, value);

  return (
    <div className="space-y-4">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <ComboBox
          allowsCustomValue
          allowsEmptyCollection
          // Gefiltert wird bei Meta, nicht hier: die Vorschläge sind bereits die
          // Antwort auf genau diese Eingabe. Nochmal lokal zu filtern würde
          // "20095" gegen den Ortsnamen "Hamburg" prüfen und ihn wegwerfen.
          defaultFilter={() => true}
          inputValue={inputValue}
          onInputChange={(text) => {
            setQuery(text);
            // Der eingetippte Text ist wieder eine Adresse – der zuvor gewählte
            // Ort darf nicht still stehen bleiben, sonst zielt die Kampagne auf
            // die Stadt, während im Feld eine Straße steht.
            if (text !== inputValue) onChange({ addressString: text, place: undefined });
          }}
          onSelectionChange={(key) => {
            const place = results.find((p) => p.key === String(key));
            if (!place) return;
            onChange({
              place,
              addressString: placeTextValue(place),
              radiusKm: fitRadius(value.radiusKm, place),
            });
          }}
          isRequired
          className="space-y-1"
        >
          <Label>Standort</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Stadt, PLZ oder Musterstraße 1, 12345 Musterstadt" />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox
              items={results}
              renderEmptyState={() => (
                <div className="text-ink-500 flex items-center gap-2 px-3 py-2 text-sm">
                  {searching ? (
                    <>
                      <Spinner size="sm" />
                      Orte werden gesucht…
                    </>
                  ) : query.trim().length < 2 ? (
                    "Tippe eine Stadt, eine PLZ – oder gleich die ganze Adresse."
                  ) : (
                    "Kein Ort bei Meta gefunden. Die Eingabe zählt dann als Adresse."
                  )}
                </div>
              )}
            >
              {(place: GeoPlace) => (
                <ListBox.Item id={place.key} textValue={placeTextValue(place)}>
                  <div className="flex flex-col">
                    <Label>{place.name}</Label>
                    <Description>{placeContext(place)}</Description>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              )}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>

        {/* Ein Ort ohne Radius bekommt auch kein Radiusfeld. Meta verwirft den
            Wert bei einer PLZ still und liefert für einen Bezirk mit Radius gar
            keine Zielgruppe mehr – ein Feld, das nichts bewirkt, wäre schlimmer
            als keines. */}
        {range ? (
          // Ein Schieber statt eines Zahlenfelds: die Grenzen sind damit sichtbar,
          // statt erst beim Tippen aufzufallen, und ein Wert außerhalb lässt sich
          // gar nicht erst einstellen.
          <div className="space-y-1">
            <Slider
              value={value.radiusKm}
              // Nur weitergeben, was sich wirklich ändert: am Anschlag meldet der
              // Schieber jeden Tastendruck erneut mit demselben Wert, und jede
              // dieser Meldungen schriebe sonst den Entwurf neu. Gedrückt
              // gehaltene Pfeiltaste am Rand hat React so schon in die
              // Update-Tiefenbegrenzung getrieben.
              onChange={(radiusKm) =>
                Number(radiusKm) !== value.radiusKm && onChange({ radiusKm: Number(radiusKm) })
              }
              minValue={range.min}
              maxValue={range.max}
              step={1}
              formatOptions={{ style: "unit", unit: "kilometer", unitDisplay: "short" }}
            >
              {/* Nur diese drei: der Schieber ist ein Raster mit den Feldern
                  label/output/track, alles andere landete darin an einer
                  beliebigen Stelle – der Hinweis stand dann neben dem Wert. */}
              <Label>Radius</Label>
              <Slider.Output />
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <Description className="block">
              {value.place
                ? `Meta erlaubt ${range.min} bis ${range.max} km um eine Stadt.`
                : `Meta erlaubt ${range.min} bis ${range.max} km um die Adresse.`}
            </Description>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="block">Radius</Label>
            <Description>
              Kein Umkreis: {value.place?.name} ist bei Meta ein fester Bereich, kein Punkt auf der
              Karte.
            </Description>
          </div>
        )}
      </div>

      <ReachLine reach={reach} />
    </div>
  );
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
  const key = JSON.stringify([
    adAccount,
    value.place?.key ?? value.addressString.trim(),
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
      <Description className="flex items-center gap-2">
        <Spinner size="sm" />
        Zielgruppe wird bei Meta geprüft…
      </Description>
    );

  const r = reach.reach;
  if ("error" in r) return <Description className="text-danger-700">{r.error}</Description>;
  // Keine Zahl heißt bei Meta nicht "null Menschen", sondern "den Ort gibt es
  // so nicht". Genau das gehört hier hin – vor dem Start ist es ein Tippfehler,
  // nach dem Start eine Anzeigengruppe, die nie ausgeliefert wird.
  if (!r.ready)
    return (
      <Description className="text-warning-700">
        Meta findet zu dieser Angabe keine Zielgruppe. Prüfe die Schreibweise, oder wähle einen Ort
        aus der Liste.
      </Description>
    );

  // Eine Zahl allein sagt niemandem, ob sie reicht. Der Hinweis steht deshalb
  // direkt darunter und nur dann, wenn er etwas zu sagen hat.
  const advice = reachAdvice(r.upper);

  return (
    <div className="space-y-1">
      <Description>
        Zielgruppe bei Meta:{" "}
        <strong className="text-ink-900">{formatReach(r.lower, r.upper)}</strong> monatlich aktive
        Menschen. Eine Spanne, keine Zusage — Meta rundet grob.
      </Description>
      {advice && <Description className="text-warning-700 block">{advice}</Description>}
    </div>
  );
}
