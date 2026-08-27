import { expect, test } from "bun:test";
import {
  duplicateLocations,
  fitRadius,
  formatReach,
  geoLocations,
  geoProblem,
  locationProblem,
  locationSummary,
  placeContext,
  placeTextValue,
  radiusRange,
  reachAdvice,
  supportsRadius,
  toGeoPlace,
  type GeoPlace,
} from "./geo";

const hamburg: GeoPlace = { type: "city", key: "560419", name: "Hamburg", region: "Hamburg" };
const plz: GeoPlace = {
  type: "zip",
  key: "DE:20095",
  name: "20095",
  region: "Hamburg",
  primaryCity: "Hamburg",
};

test("aus Metas Suchantwort wird ein Ort, aus fremden Typen keiner", () => {
  expect(
    toGeoPlace({ key: 560419, name: "Hamburg", type: "city", region: "Hamburg" }),
  ).toEqual(hamburg);
  // Meta liefert bei anderen location_types auch Typen, für die wir keinen Topf
  // in geo_locations kennen – die dürfen nicht als Vorschlag durchrutschen.
  expect(toGeoPlace({ key: "1", name: "Irgendwo", type: "geo_market" })).toBeUndefined();
  expect(toGeoPlace({ name: "Ohne Schlüssel", type: "city" })).toBeUndefined();
  expect(toGeoPlace(null)).toBeUndefined();
});

test("nur Städte tragen einen Radius", () => {
  // Gegen delivery_estimate gemessen: PLZ verwirft den Radius still, Stadtteil
  // liefert damit gar keine Zielgruppe mehr.
  expect(supportsRadius("city")).toBe(true);
  for (const t of ["zip", "region", "subcity", "neighborhood"] as const)
    expect(supportsRadius(t)).toBe(false);

  expect(geoLocations({ addressString: "", radiusKm: 20, place: hamburg })).toEqual({
    cities: [{ key: "560419", radius: 20, distance_unit: "kilometer" }],
  });
  expect(geoLocations({ addressString: "", radiusKm: 20, place: plz })).toEqual({
    zips: [{ key: "DE:20095" }],
  });
});

test("ohne Ort bleibt es bei der Adresse als custom_location", () => {
  expect(geoLocations({ addressString: "  Hauptstr. 1, Dresden ", radiusKm: 17 })).toEqual({
    custom_locations: [
      { address_string: "Hauptstr. 1, Dresden", radius: 17, distance_unit: "kilometer" },
    ],
  });
});

test("die Untergrenze ist überall 17 km – Facebook lehnt alles darunter ab", () => {
  expect(radiusRange(hamburg)).toEqual({ min: 17, max: 80 });
  expect(radiusRange(undefined)).toEqual({ min: 17, max: 80 });
  // Ein Ort ohne Radius hat auch keine Grenze, die man verletzen könnte.
  expect(radiusRange(plz)).toBeUndefined();

  expect(locationProblem({ addressString: "", radiusKm: 16, place: hamburg })).toMatch(/17 und 80/);
  expect(locationProblem({ addressString: "", radiusKm: 17, place: hamburg })).toBeUndefined();
  expect(locationProblem({ addressString: "x", radiusKm: 17 })).toBeUndefined();
  expect(locationProblem({ addressString: "x", radiusKm: 16 })).toMatch(/17 und 80/);
  expect(locationProblem({ addressString: "  ", radiusKm: 17 })).toMatch(/adresse/i);
  // Der Radius eines radiuslosen Orts darf nichts aufhalten – er wird gar nicht
  // mitgeschickt, egal was im Feld steht.
  expect(locationProblem({ addressString: "", radiusKm: 999, place: plz })).toBeUndefined();
});

test("ein zu kleiner Radius wächst auf die Untergrenze mit", () => {
  // Ohne diesen Sprung stünde nach der Auswahl eine Anzeigengruppe da, die
  // Facebook beim Anlegen ablehnt.
  expect(fitRadius(5, hamburg)).toBe(17);
  expect(fitRadius(30, hamburg)).toBe(30);
  expect(fitRadius(90, hamburg)).toBe(80);
  expect(fitRadius(5, undefined)).toBe(17);
  // Ein Ort ohne Radius lässt den Wert stehen: er wird ohnehin nicht geschickt.
  expect(fitRadius(5, plz)).toBe(5);
});

test("gleichnamige Orte sind in der Vorschlagsliste zu unterscheiden", () => {
  const altonaHH: GeoPlace = { type: "subcity", key: "1", name: "Altona", region: "Hamburg" };
  const altonaST: GeoPlace = {
    type: "subcity",
    key: "2",
    name: "Altona",
    region: "Sachsen-Anhalt",
  };
  expect(placeContext(altonaHH)).not.toBe(placeContext(altonaST));
  expect(placeTextValue(plz)).toBe("20095 (PLZ · Hamburg · Hamburg)");
});

test("die Zusammenfassung nennt den Radius nur, wenn es einen gibt", () => {
  expect(locationSummary({ addressString: "Hauptstr. 1", radiusKm: 17 })).toBe(
    "Hauptstr. 1 · 17 km",
  );
  expect(locationSummary({ addressString: "", radiusKm: 17 })).toBe("Adresse fehlt · 17 km");
  expect(locationSummary({ addressString: "", radiusKm: 20, place: hamburg })).toBe(
    "Hamburg (Stadt · Hamburg) · 20 km",
  );
  expect(locationSummary({ addressString: "", radiusKm: 20, place: plz })).toBe(
    "20095 (PLZ · Hamburg · Hamburg)",
  );
});

test("die Reichweite trägt ihre Einheit einmal, nicht an jeder Zahl", () => {
  expect(formatReach(1_300_000, 1_500_000)).toBe("1,3–1,5 Mio.");
  expect(formatReach(76_500, 90_000)).toBe("76.500–90.000");
  expect(formatReach(1_000, 1_000)).toBe("1.000");
});

test("eine zu kleine Zielgruppe wird benannt, eine ausreichende nicht", () => {
  expect(reachAdvice(12_400)).toMatch(/Kleine Zielgruppe/);
  // Genau an der Grenze ist noch in Ordnung – sonst hinge an einer runden Zahl
  // eine Warnung, die niemand abstellen kann.
  expect(reachAdvice(50_000)).toBeUndefined();
  expect(reachAdvice(1_200_000)).toBeUndefined();
});

test("zwei Anzeigengruppen am selben Ort fallen auf, verschiedene nicht", () => {
  const dresden: GeoPlace = { type: "city", key: "549668", name: "Dresden" };
  expect(
    duplicateLocations([
      { name: "Pflegekräfte", addressString: "", place: dresden },
      { name: "PDL", addressString: "", place: dresden },
    ]),
  ).toEqual(["„Pflegekräfte“ und „PDL“ zielen auf denselben Ort — sie bieten dann bei Meta gegeneinander."]);

  // Derselbe Ort in anderer Schreibweise ist derselbe Ort.
  expect(
    duplicateLocations([
      { name: "A", addressString: "Hauptstr. 1, Dresden" },
      { name: "B", addressString: "  hauptstr. 1,   Dresden " },
    ]),
  ).toHaveLength(1);

  expect(
    duplicateLocations([
      { name: "A", addressString: "", place: dresden },
      { name: "B", addressString: "", place: { type: "city", key: "560419", name: "Hamburg" } },
    ]),
  ).toEqual([]);

  // Zwei leere Felder sind nicht derselbe Ort, sondern zweimal keiner – dafür
  // gibt es schon einen eigenen Blocker.
  expect(
    duplicateLocations([
      { name: "A", addressString: "" },
      { name: "B", addressString: "  " },
    ]),
  ).toEqual([]);
});

test("das zurückgelesene Targeting wird am Schlüssel geprüft, nicht am Text", () => {
  // So kommt eine Adresse bei Meta zurück: umgeschrieben, mit Koordinaten. Auf
  // Textgleichheit zu prüfen ließe jede zweite Anzeigengruppe durchfallen.
  const sent = geoLocations({ addressString: "Valentinskamp 40, 20355 Hamburg", radiusKm: 17 });
  expect(
    geoProblem(sent, {
      custom_locations: [
        {
          name: "40 Valentinskamp, Hamburg, Hamburg, Deutschland",
          address_string: "40 Valentinskamp, Hamburg, Hamburg, Deutschland",
          latitude: 53.55551,
          longitude: 9.98277,
          radius: 17,
          distance_unit: "kilometer",
        },
      ],
      location_types: ["home", "recent"],
    }),
  ).toBeUndefined();

  // Ohne Koordinaten hat Meta die Adresse nicht gefunden.
  expect(geoProblem(sent, { custom_locations: [{ radius: 17 }] })).toMatch(/Koordinaten/);
  expect(geoProblem(sent, { custom_locations: [{ latitude: 1, longitude: 2, radius: 25 }] })).toMatch(
    /25 statt 17/,
  );
  expect(geoProblem(sent, { countries: ["DE"] })).toMatch(/Adresse fehlt/);
});

test("ein Topf, den niemand geschickt hat, fällt auf", () => {
  const sent = geoLocations({
    addressString: "",
    radiusKm: 20,
    place: { type: "city", key: "560419", name: "Hamburg" },
  });
  // Meta gibt den Schlüssel mal als Zahl zurück, mal als Zeichenkette.
  expect(
    geoProblem(sent, { cities: [{ key: 560419, name: "Hamburg", radius: 20 }], location_types: [] }),
  ).toBeUndefined();
  expect(geoProblem(sent, { cities: [{ key: "573831", radius: 20 }] })).toMatch(/560419 fehlt/);

  // Das teure Versehen: die Stadt stimmt, aber daneben streut ein ganzes Land
  // das Budget. Im Ads Manager sieht die Anzeigengruppe dabei normal aus.
  expect(
    geoProblem(sent, { cities: [{ key: "560419", radius: 20 }], countries: ["DE"] }),
  ).toMatch(/zusätzlich countries/);
});
