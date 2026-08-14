import { expect, test } from "bun:test";
import { createConvoy } from "./convoy";

/** Ein Versprechen, das eingelöst wurde – ohne darauf zu warten. */
const settled = async (p: Promise<void>) => {
  let done = false;
  void p.then(() => (done = true));
  // Zwei Runden, weil die Auflösung selbst schon einen Microtask kostet.
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

test("ein voller Schwung fährt sofort, ein halber wartet", async () => {
  const convoy = createConvoy(2, 4);

  const first = convoy.join();
  expect(await settled(first)).toBe(false);

  const second = convoy.join();
  expect(await settled(first)).toBe(true);
  expect(await settled(second)).toBe(true);
  expect(convoy.waiting).toBe(0);
});

test("der letzte Rest fährt, sobald niemand mehr kommen kann", async () => {
  // Drei Dateien bei einer Breite von zwei: die dritte machte den zweiten
  // Schwung nie voll und wartete ohne diesen Fall bis zum Seitenwechsel.
  const convoy = createConvoy(2, 3);
  void convoy.join();
  void convoy.join();

  const last = convoy.join();
  expect(await settled(last)).toBe(true);
});

test("eine gescheiterte Datei hält die Wartenden nicht auf", async () => {
  const convoy = createConvoy(3, 2);
  const waiting = convoy.join();
  expect(await settled(waiting)).toBe(false);

  // Die zweite Datei kommt gar nicht erst am Sammelpunkt an.
  convoy.drop();
  expect(await settled(waiting)).toBe(true);
});

test("nur wer wirklich wartet, bekommt die Wartemeldung", async () => {
  const convoy = createConvoy(2, 2);
  let announced = 0;
  void convoy.join(() => announced++);
  expect(announced).toBe(1);

  // Diese macht den Schwung voll – für sie gibt es nichts zu melden.
  void convoy.join(() => announced++);
  expect(announced).toBe(1);
});
