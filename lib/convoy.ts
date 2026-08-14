/**
 * Ein Sammelpunkt für Arbeit, die zusammen losfahren soll – und nur dafür.
 *
 * Gegenstück zu createGate(): das begrenzt, wie viel gleichzeitig läuft, dieses
 * hier bündelt, was einzeln fertig wird. Eigenes Modul aus demselben Grund –
 * der Fall, der schiefgeht, ist der letzte Rest: wer auf einen vollen Schwung
 * wartet, den es nie mehr gibt, wartet für immer, und das fällt erst bei einer
 * ungeraden Dateizahl auf.
 */
export type Convoy = {
  /**
   * Reiht sich ein und wartet auf die Abfahrt. `onWait` läuft nur, wenn wirklich
   * gewartet wird – wer den Schwung vollmacht, soll keine Wartemeldung zeigen.
   */
  join: (onWait?: () => void) => Promise<void>;
  /** Meldet einen Mitfahrer ab, der es nicht bis hierher schafft. */
  drop: () => void;
  /** Nur für Tests und Diagnose. */
  readonly waiting: number;
};

/**
 * `size` ist die Breite eines Schwungs, `expected` die Zahl derer, die insgesamt
 * noch kommen können – aus ihr ergibt sich, wann der letzte Rest fahren darf.
 */
export function createConvoy(size: number, expected: number): Convoy {
  // Eine Breite unter eins wäre kein Schwung, sondern ein Stillstand.
  const width = Math.max(1, Math.floor(size) || 1);
  let outstanding = Math.max(0, expected);
  const waiting: (() => void)[] = [];

  const depart = () => {
    for (const go of waiting.splice(0, waiting.length)) go();
  };

  return {
    join(onWait) {
      const ride = new Promise<void>((resolve) => waiting.push(resolve));
      outstanding--;
      // Voll oder Rest: im zweiten Fall kommt niemand mehr, der ihn vollmacht.
      if (waiting.length >= width || outstanding <= 0) depart();
      else onWait?.();
      return ride;
    },
    drop() {
      outstanding--;
      if (outstanding <= 0) depart();
    },
    get waiting() {
      return waiting.length;
    },
  };
}
