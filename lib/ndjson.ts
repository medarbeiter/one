/**
 * Eine Warteschlange, die als NDJSON-Stream herausläuft – eine Meldung je Zeile,
 * sofort beim Entstehen und nicht erst am Ende.
 *
 * Der Umweg über die Warteschlange ist nötig, weil der Erzeuger (launch()) nicht
 * darauf wartet, dass jemand liest: er ruft seinen onProgress-Callback und
 * arbeitet weiter. Ohne Puffer ginge jede Meldung verloren, die entsteht,
 * während der Leser noch mit der vorigen beschäftigt ist.
 */
export type NdjsonSink<T> = {
  push: (value: T) => void;
  close: () => void;
  stream: ReadableStream<Uint8Array>;
};

export function ndjsonSink<T>(): NdjsonSink<T> {
  const encoder = new TextEncoder();
  const queue: T[] = [];
  let closed = false;
  // Weckt einen wartenden pull(), sobald wieder etwas dasteht.
  let wake: (() => void) | undefined;

  const signal = () => {
    wake?.();
    wake = undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (!queue.length && !closed) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      if (!queue.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(JSON.stringify(queue.shift()) + "\n"));
    },
  });

  return {
    push(value) {
      if (closed) return;
      queue.push(value);
      signal();
    },
    close() {
      closed = true;
      signal();
    },
    stream,
  };
}

/** Die Gegenseite: liest die Zeilen wieder einzeln heraus. */
export async function* readNdjson<T>(
  body: ReadableStream<Uint8Array<ArrayBufferLike>>,
): AsyncGenerator<T> {
  // Von Hand dekodiert statt über TextDecoderStream: stream: true hält ein
  // Mehrbyte-Zeichen zusammen, das über eine Chunk-Grenze fällt – die Meldungen
  // sind voller Namen mit Umlauten und typografischen Anführungszeichen.
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Die letzte Zeile im Puffer kann angeschnitten sein – die bleibt liegen.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as T;
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield JSON.parse(buffer) as T;
}
