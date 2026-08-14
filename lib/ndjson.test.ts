import { expect, test } from "bun:test";
import { ndjsonSink, readNdjson } from "./ndjson";

const tick = () => new Promise((r) => setTimeout(r, 5));

const encodeLine = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) + "\n");

const chunks = (parts: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });

test("a line is readable as soon as it is pushed, not only at the end", async () => {
  // Das ist der ganze Punkt der Übung: vorher kam die Antwort erst, wenn alle
  // dreißig Aufrufe gegen Meta durch waren.
  const sink = ndjsonSink<{ n: number }>();
  const events = readNdjson<{ n: number }>(sink.stream);

  sink.push({ n: 1 });
  expect((await events.next()).value).toEqual({ n: 1 });

  // Zwischen zwei Meldungen darf der Leser nicht hängen bleiben.
  await tick();
  sink.push({ n: 2 });
  expect((await events.next()).value).toEqual({ n: 2 });

  sink.close();
  expect((await events.next()).done).toBe(true);
});

test("messages pushed faster than they are read keep their order", async () => {
  const sink = ndjsonSink<number>();
  for (const n of [1, 2, 3]) sink.push(n);
  sink.close();

  const seen: number[] = [];
  for await (const n of readNdjson<number>(sink.stream)) seen.push(n);
  expect(seen).toEqual([1, 2, 3]);
});

test("a reader waiting on an empty queue ends when the sink closes", async () => {
  const sink = ndjsonSink<number>();
  const events = readNdjson<number>(sink.stream);
  const pending = events.next();
  await tick();
  sink.close();
  expect((await pending).done).toBe(true);
});

test("text is not cut apart, even where a chunk boundary falls inside a line", async () => {
  // Der Leser puffert die letzte, womöglich angeschnittene Zeile – ohne das
  // stürzt JSON.parse mitten im Anlegen ab.
  const encoder = new TextEncoder();
  const stream = chunks(
    ['{"label":"Creating ad Elisa', 'beth 5","done":3}\n'].map((h) => encoder.encode(h)),
  );

  const seen: unknown[] = [];
  for await (const e of readNdjson(stream)) seen.push(e);
  expect(seen).toEqual([{ label: "Creating ad Elisabeth 5", done: 3 }]);
});

test("pushing after close is ignored instead of throwing", async () => {
  // launch() kann noch eine Meldung nachschieben, wenn der Browser die
  // Verbindung schon getrennt hat.
  const sink = ndjsonSink<number>();
  sink.close();
  expect(() => sink.push(1)).not.toThrow();
});

test("a name with umlauts survives a split in the middle of a character", async () => {
  // Die Meldungen tragen Kundennamen und typografische Anführungszeichen –
  // beides mehrbytig. Wird genau dazwischen getrennt, macht ein Decoder ohne
  // stream: true ein Ersatzzeichen daraus.
  const event = { label: "Creating ad set “Pflegedienst Schölzke”" };
  const full = encodeLine(event);
  // Mitten in das ö: dessen erstes Byte ist 0xC3, das zweite 0xB6.
  const cut = full.indexOf(0xc3) + 1;
  expect(full[cut]).toBe(0xb6);

  const seen: unknown[] = [];
  for await (const e of readNdjson(chunks([full.slice(0, cut), full.slice(cut)]))) seen.push(e);
  expect(seen).toEqual([event]);
});
