"use client";

/**
 * Die Karte zum Standortfeld: zeigt Pin und Umkreis zu dem, was gewählt ist,
 * und nimmt einen Klick oder ein Ziehen als neuen Pin.
 *
 * Nur im Browser (dynamic in location-field.tsx): MapLibre braucht WebGL und
 * ist mit 250 kB der größte Brocken der Seite – er kommt erst, wenn ein
 * Standort aufgeklappt ist. Kacheln von OpenFreeMap, ohne Schlüssel.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MapLibre,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import { circleRing, type GeoPin } from "@/lib/geo";
import { PALETTE } from "@/lib/palette";
import styles from "./location-map.module.css";

// MapLibre 6 sucht seinen Kachel-Worker neben seinem eigenen Modul – im
// Next-Bundle liegt dort ein Chunk, kein Worker, und die Karte bleibt still
// leer (Attribution da, keine Kacheln, kein load-Ereignis). Der Worker
// importiert zudem eine zweite Datei relativ zu sich selbst, die ein
// Bundler-Asset nicht mitbrächte. Deshalb liegen beide Dateien in
// public/maplibre – lib/maplibre-worker.test.ts hält sie mit dem Paket gleich.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const STYLE = "https://tiles.openfreemap.org/styles/positron";
/** Deutschland – die leere Karte zeigt das Land, nicht die Welt. */
const GERMANY: [[number, number], [number, number]] = [[5.8, 47.2], [15.1, 55.1]];
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
/** Wie --beat-arc und --ease-move in theme/motion.css: die Kamera kommt an, sie springt nicht. */
const MOVE = { duration: 700, easing: (t: number) => 1 - Math.pow(1 - t, 3) };

export type LocationMapProps = {
  center?: GeoPin;
  /** Ohne Radius (PLZ, Bezirk) nur der Pin – Meta kennt dort keinen Umkreis. */
  radiusKm?: number;
  /** Zoom ohne Umkreis: ein Bundesland braucht mehr Abstand als ein Stadtteil. */
  zoom?: number;
  onPin: (pin: GeoPin) => void;
};

export default function LocationMap({ center, radiusKm, zoom = 11, onPin }: LocationMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const marker = useRef<Marker | null>(null);
  const ready = useRef(false);
  const dragging = useRef(false);
  // Der aktuelle Wunsch, für den load-Handler: die Karte lädt asynchron, und
  // der erste Standort ist meist schon da, bevor sie es ist.
  const want = useRef({ center, radiusKm, zoom, onPin });
  want.current = { center, radiusKm, zoom, onPin };

  useEffect(() => {
    if (!host.current) return;
    const m = new MapLibre({
      container: host.current,
      style: STYLE,
      bounds: GERMANY,
      cooperativeGestures: true,
      attributionControl: { compact: true },
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Strg + Scrollen zum Zoomen",
        "CooperativeGesturesHandler.MacHelpText": "⌘ + Scrollen zum Zoomen",
        "CooperativeGesturesHandler.MobileHelpText": "Mit zwei Fingern bewegen",
        "NavigationControl.ZoomIn": "Hineinzoomen",
        "NavigationControl.ZoomOut": "Herauszoomen",
      },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      // Positron beschriftet auf Englisch („Hanover“, „Lower Saxony“); die
      // Kacheln tragen den deutschen Namen mit.
      for (const layer of m.getStyle().layers)
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field"))
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:de"], ["get", "name"]]);
      m.addSource("radius", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: { "fill-color": PALETTE.gold, "fill-opacity": 0.16 },
      });
      m.addLayer({
        id: "radius-line",
        type: "line",
        source: "radius",
        paint: { "line-color": PALETTE.goldIcon, "line-width": 1.5 },
      });
      ready.current = true;
      sync();
    });
    m.on("click", (e: MapMouseEvent) => want.current.onPin({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Karte an den Wunsch angleichen – beim Laden und bei jeder Änderung. */
  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { center, radiusKm, zoom } = want.current;
    const source = m.getSource("radius") as GeoJSONSource;

    if (!center) {
      marker.current?.remove();
      marker.current = null;
      source.setData(EMPTY);
      m.fitBounds(GERMANY, { padding: 16, ...MOVE });
      return;
    }

    if (!marker.current) {
      const mk = new Marker({ element: pinElement(), anchor: "bottom", draggable: true })
        .setLngLat([center.lng, center.lat])
        .addTo(m);
      mk.on("dragstart", () => (dragging.current = true));
      mk.on("dragend", () => {
        const p = mk.getLngLat();
        want.current.onPin({ lat: p.lat, lng: p.lng });
      });
      marker.current = mk;
      drop(mk.getElement());
    } else {
      marker.current.setLngLat([center.lng, center.lat]);
      // Nach dem Ziehen steht der Pin schon da – nur ein gesetzter fällt.
      if (dragging.current) dragging.current = false;
      else drop(marker.current.getElement());
    }

    if (radiusKm) {
      const ring = circleRing(center, radiusKm);
      source.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } });
      const lngs = ring.map((p) => p[0]);
      const lats = ring.map((p) => p[1]);
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 36, ...MOVE },
      );
    } else {
      source.setData(EMPTY);
      m.easeTo({ center: [center.lng, center.lat], zoom, ...MOVE });
    }
  }

  useEffect(sync, [center?.lat, center?.lng, radiusKm, zoom]);

  return <div ref={host} className={styles.map} role="application" aria-label="Karte: Klick setzt den Standort-Pin" />;
}

/** Gold auf Tinte, wie der Primärknopf – nur Konstanten im Markup, kein Nutzertext. */
function pinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = styles.pin;
  el.title = "Standort – ziehen verschiebt ihn";
  // Ein Klick auf den Pin ist kein Klick auf die Karte: sonst wanderte er bei
  // jedem Antippen um seine eigene Höhe nach Norden.
  el.addEventListener("click", (e) => e.stopPropagation());
  el.innerHTML =
    `<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true">` +
    `<path d="M15 38.5C15 38.5 2.5 23.5 2.5 14a12.5 12.5 0 0 1 25 0c0 9.5-12.5 24.5-12.5 24.5Z" fill="${PALETTE.gold}" stroke="${PALETTE.ink}" stroke-width="2"/>` +
    `<circle cx="15" cy="14" r="4.5" fill="${PALETTE.ink}"/></svg>`;
  return el;
}

/** Der Pin fällt auf die Karte: --beat-draw auf --ease-spring, wie in theme/motion.css. */
function drop(el: HTMLElement) {
  const svg = el.firstElementChild;
  if (!svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  svg.animate(
    [
      { transform: "translateY(-28px) scale(0.7)", opacity: 0 },
      { transform: "translateY(0) scale(1)", opacity: 1 },
    ],
    { duration: 300, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  );
}
