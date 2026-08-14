/**
 * Eine Obergrenze für gleichzeitig laufende Arbeit – und nur dafür.
 *
 * Eigenes Modul, weil das Weiterreichen des Platzes (siehe release) die Art
 * Detail ist, die in einer Komponente niemand nachprüft und die falsch genau
 * dann auffällt, wenn zwanzig Dateien gleichzeitig ankommen.
 */
export type Gate = {
  /**
   * Wartet auf einen Platz. `onWait` läuft nur, wenn wirklich gewartet wird –
   * wer sofort drankommt, soll keine Wartemeldung anzeigen.
   */
  acquire: (onWait?: () => void) => Promise<void>;
  /** Gibt den Platz zurück. Genau einmal je erfolgreichem acquire(). */
  release: () => void;
  /** Nur für Tests und Diagnose. */
  readonly active: number;
};

export function createGate(limit: number): Gate {
  // Eine Grenze unter eins wäre keine Grenze, sondern ein Stillstand: `active <
  // lanes` träfe nie zu, also wartete jeder Aufruf – und weil niemand
  // durchkommt, ruft auch niemand release(). Nichts weckt die Wartenden je
  // wieder auf. Gerechnet wird die Grenze aus navigator.hardwareConcurrency,
  // und das kennt nicht jede Umgebung; eine 0 oder ein NaN von dort darf nicht
  // alle Uploads für immer anhalten.
  const lanes = Math.max(1, Math.floor(limit) || 1);
  let active = 0;
  const waiting: (() => void)[] = [];

  return {
    async acquire(onWait) {
      if (active < lanes) {
        active++;
        return;
      }
      onWait?.();
      await new Promise<void>((resolve) => waiting.push(resolve));
    },
    release() {
      // Der Platz wird an den nächsten Wartenden weitergereicht, statt ihn erst
      // freizugeben und ihn sich neu nehmen zu lassen: `active--` und das
      // Aufwecken liegen sonst zwei Microtasks auseinander, und in die Lücke
      // passt eine gerade erst ausgewählte Datei. Für einen Moment liefen dann
      // limit + 1 Umwandlungen – genau der Fall, den diese Grenze verhindern
      // soll, und er träte nur unter Last auf.
      const next = waiting.shift();
      if (next) next();
      else if (active > 0) active--;
    },
    get active() {
      return active;
    },
  };
}
