/**
 * Die Grenze hält nur, wenn sie auch unter Last hält – und "unter Last" heißt
 * hier: es kommt etwas dazu, während schon jemand wartet.
 */
import { expect, test } from "bun:test";
import { createGate } from "./gate";

test("bis zur Grenze läuft alles sofort", async () => {
  const gate = createGate(2);
  let waited = 0;
  await gate.acquire(() => waited++);
  await gate.acquire(() => waited++);
  expect(gate.active).toBe(2);
  // Wer sofort drankommt, bekommt keine Wartemeldung.
  expect(waited).toBe(0);
});

test("der dritte wartet und meldet das", async () => {
  const gate = createGate(2);
  await gate.acquire();
  await gate.acquire();

  let waited = 0;
  let through = false;
  void gate.acquire(() => waited++).then(() => (through = true));
  await Promise.resolve();
  expect(waited).toBe(1);
  expect(through).toBe(false);

  gate.release();
  // Zwei Microtasks: das Auflösen des Promise und die Fortsetzung dahinter.
  await Promise.resolve();
  await Promise.resolve();
  expect(through).toBe(true);
});

test("ein Nachzügler drängelt sich nicht am Wartenden vorbei", async () => {
  // Der Fall, für den release() den Platz weiterreicht statt ihn freizugeben:
  // während jemand wartet, wird nachgelegt. Würde der freigewordene Platz erst
  // frei und dann neu vergeben, liefen kurzzeitig drei Umwandlungen.
  const gate = createGate(2);
  await gate.acquire();
  await gate.acquire();

  const order: string[] = [];
  void gate.acquire().then(() => order.push("wartend"));
  await Promise.resolve();

  gate.release();
  // Der Nachzügler fragt im selben Moment, in dem der Platz frei wird.
  void gate.acquire().then(() => order.push("nachzuegler"));

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  expect(gate.active).toBe(2);
  expect(order).toEqual(["wartend"]);
});

test("eine Grenze unter eins hält niemanden an", async () => {
  // Sonst hinge der ganze Schwung: ohne eine freie Bahn wartet der erste Aufruf,
  // und weil er nie durchkommt, gibt er auch nie eine Bahn frei.
  for (const bad of [0, -1, Number.NaN]) {
    const gate = createGate(bad);
    let waited = 0;
    await gate.acquire(() => waited++);
    expect(waited).toBe(0);
    expect(gate.active).toBe(1);
  }
});

test("mehr Freigaben als Plätze zählen nicht ins Minus", async () => {
  // Sonst öffnete ein doppeltes release() die Grenze dauerhaft: active fiele
  // unter null und die nächsten Aufrufe kämen alle sofort durch.
  const gate = createGate(1);
  await gate.acquire();
  gate.release();
  gate.release();
  expect(gate.active).toBe(0);

  await gate.acquire();
  let waited = 0;
  void gate.acquire(() => waited++);
  await Promise.resolve();
  expect(waited).toBe(1);
});
