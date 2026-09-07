import { expect, test } from "bun:test";
import { POST } from "./route";

const post = (body: BodyInit) => POST(new Request("http://local/api/brief", { method: "POST", body }));

test("die Brief-Route weist kaputtes JSON, fehlende Aufgabe und falsch getypte Hinweise mit 400 ab", async () => {
  expect((await post("nicht json")).status).toBe(400);
  expect((await post(JSON.stringify({}))).status).toBe(400);
  expect((await post(JSON.stringify({ taskId: "  " }))).status).toBe(400);
  expect((await post(JSON.stringify({ taskId: "t1", aiNotes: 5 }))).status).toBe(400);
  expect((await post(JSON.stringify({ taskId: "t1", aiNotes: "x".repeat(4001) }))).status).toBe(400);
});

test("die Brief-Route streamt bei gültigem Body NDJSON und endet mit einem Ergebnis", async () => {
  const response = await post(JSON.stringify({ taskId: "t1", aiNotes: "x".repeat(4000) }));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  // Ohne ClickUp-Token scheitert der Zusammenbau – aber als Ergebnis-Zeile, nicht als HTTP-Fehler.
  const lines = (await response.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string });
  expect(lines.at(-1)?.type).toBe("result");
});
