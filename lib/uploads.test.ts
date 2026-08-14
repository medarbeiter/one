/**
 * bun test – große Videos gehen in Stücken hoch. Ein einzelner POST mit 187 MB
 * hat Graph mit "413" beantwortet bzw. die Verbindung mittendrin fallen lassen;
 * genau das ist der Fehler, der die UGC-Uploads gekippt hat.
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "SYSTEM";

const { uploadVideo, CHUNKED_ABOVE } = await import("./uploads");

type Call = { url: URL; body: FormData };

/** Sammelt jeden POST und beantwortet ihn wie Graph. */
function stub(reply: (body: FormData, url: URL) => unknown) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body as FormData | undefined;
    if (body) calls.push({ url, body });
    return new Response(JSON.stringify(body ? reply(body, url) : { status: { video_status: "ready" } }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const video = (bytes: number) =>
  new File([new Uint8Array(bytes)], "Rundflug.mp4", { type: "video/mp4" });

test("kleine Videos gehen weiter in einem Stück hoch", async () => {
  const calls = stub(() => ({ id: "V1" }));

  expect(await uploadVideo(video(1024), "act_1")).toBe("V1");

  expect(calls).toHaveLength(1);
  expect(calls[0].url.pathname).toBe("/v26.0/act_1/advideos");
  expect(calls[0].body.get("source")).toBeInstanceOf(Blob);
});

test("große Videos laufen über start / transfer / finish", async () => {
  const size = CHUNKED_ABOVE + 1000;
  // So teilt Meta in der Praxis: ein paar Dutzend Stücke, nicht Tausende.
  const chunk = 4 * 1024 * 1024;
  const calls = stub((body) => {
    const phase = body.get("upload_phase");
    if (phase === "start")
      return { video_id: "V2", upload_session_id: "S", start_offset: "0", end_offset: String(chunk) };
    if (phase === "transfer") {
      const from = Number(body.get("start_offset")) + Number((body.get("video_file_chunk") as Blob).size);
      return { start_offset: String(from), end_offset: String(Math.min(from + chunk, size)) };
    }
    return { success: true };
  });

  expect(await uploadVideo(video(size), "act_1")).toBe("V2");

  const phases = calls.map((c) => c.body.get("upload_phase"));
  expect(phases[0]).toBe("start");
  expect(phases.at(-1)).toBe("finish");
  expect(calls[0].body.get("file_size")).toBe(String(size));

  // Jedes Stück genau einmal, lückenlos, in der Reihenfolge, die Meta vorgibt.
  const transfers = calls.filter((c) => c.body.get("upload_phase") === "transfer");
  let offset = 0;
  for (const t of transfers) {
    expect(t.body.get("start_offset")).toBe(String(offset));
    expect(t.body.get("upload_session_id")).toBe("S");
    offset += (t.body.get("video_file_chunk") as Blob).size;
  }
  expect(offset).toBe(size);
});

test("ein Stück, das nicht vorankommt, bricht ab statt ewig zu laufen", async () => {
  // Graph nennt zweimal denselben Offset – ohne Abbruch liefe die Schleife für
  // immer und der Upload sähe nur aus wie „hängt".
  stub((body) =>
    body.get("upload_phase") === "start"
      ? { video_id: "V3", upload_session_id: "S", start_offset: "0", end_offset: "100" }
      : { start_offset: "0", end_offset: "100" },
  );

  expect(uploadVideo(video(CHUNKED_ABOVE + 1), "act_1")).rejects.toThrow(/kam nicht voran|no progress/i);
});
