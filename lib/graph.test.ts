/**
 * bun test – die Stellen, die still kaputtgehen: Parameter-Serialisierung,
 * Fehler-Einordnung und der Retry bei Rate-Limits.
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
process.env.META_AD_ACCOUNT_ID = "act_1";

const { graph, actId, mapGraphError, GraphError, encodeParams } = await import("./graph");

test("Konto-IDs bekommen das act_-Präfix, doppelt aber nicht", () => {
  expect(actId("61593202229799")).toBe("act_61593202229799");
  expect(actId("act_61593202229799")).toBe("act_61593202229799");
  expect(actId("")).toBe("");
});

test("Parameter werden für Graph kodiert: Objekte als JSON, leere Werte gar nicht", () => {
  const p = encodeParams({ a: 1, t: { age_min: 25 }, skip: undefined, none: null });
  expect(p.get("a")).toBe("1");
  expect(p.get("t")).toBe('{"age_min":25}');
  expect(p.has("skip")).toBe(false);
  expect(p.has("none")).toBe(false);
});

test("Fehlercodes werden auf Handlungsoptionen abgebildet", () => {
  expect(mapGraphError({ code: 190, message: "expired" }, 401).kind).toBe("token");
  expect(mapGraphError({ code: 200, message: "no perm" }, 403).kind).toBe("permission");
  expect(mapGraphError({ code: 17, message: "limit" }, 400)).toMatchObject({
    kind: "rate",
    retryable: true,
  });
  expect(mapGraphError({ code: 613, message: "limit" }, 400).retryable).toBe(true);
  // error_user_msg schlägt message – nur die ist für Menschen geschrieben.
  expect(mapGraphError({ code: 1, message: "raw", error_user_msg: "Nicer" }).message).toBe("Nicer");
  expect(mapGraphError(undefined, 500)).toMatchObject({ kind: "unknown", retryable: true });
  expect(mapGraphError(undefined, 400).retryable).toBe(false);
});

function stub(handler: (url: URL) => { status?: number; body: unknown }) {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    calls.push(url);
    const { status = 200, body } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

test("Objekte werden als JSON serialisiert, Token gesetzt", async () => {
  const calls = stub(() => ({ body: { ok: 1 } }));
  await graph("act_1/campaigns", {
    method: "POST",
    params: { targeting: { age_min: 25 }, name: "X", skip: undefined },
  });
  expect(calls[0].searchParams.get("targeting")).toBe('{"age_min":25}');
  expect(calls[0].searchParams.get("access_token")).toBe("TEST");
  expect(calls[0].searchParams.has("skip")).toBe(false);
});

test("Rate-Limit wird wiederholt, Berechtigungsfehler nicht", async () => {
  let n = 0;
  stub(() => {
    n++;
    return n < 3
      ? { status: 400, body: { error: { code: 17, message: "limit" } } }
      : { body: { ok: 1 } };
  });
  const result = await graph("x");
  expect(result).toEqual({ ok: 1 });
  expect(n).toBe(3);

  n = 0;
  stub(() => {
    n++;
    return { status: 403, body: { error: { code: 200, message: "no perm" } } };
  });
  await expect(graph("y")).rejects.toThrow("no perm");
  expect(n).toBe(1);
});

test("Fehler tragen ihre Einordnung mit", async () => {
  stub(() => ({ status: 401, body: { error: { code: 190, message: "expired" } } }));
  const err = await graph("z").catch((e) => e);
  expect(err).toBeInstanceOf(GraphError);
  expect(err.kind).toBe("token");
});

const { batch, unwrapBatchItem } = await import("./graph");

test("Ein totes Sub-Request nimmt die anderen nicht mit", () => {
  expect(unwrapBatchItem<{ id: string }>({ code: 200, body: '{"id":"1"}' })).toEqual({
    status: "fulfilled",
    value: { id: "1" },
  });

  const bad = unwrapBatchItem({ code: 403, body: '{"error":{"code":200,"message":"no perm"}}' });
  expect(bad.status).toBe("rejected");
  expect((bad as PromiseRejectedResult).reason.kind).toBe("permission");

  // null = Sub-Request lief in den Timeout; Graph liefert dann kein Objekt.
  expect(unwrapBatchItem(null).status).toBe("rejected");
});

test("Mehr als 50 Requests werden gestückelt, Reihenfolge bleibt", async () => {
  const calls: string[][] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    const spec = JSON.parse(url.searchParams.get("batch")!) as { relative_url: string }[];
    calls.push(spec.map((s) => s.relative_url));
    return new Response(
      JSON.stringify(spec.map((s) => ({ code: 200, body: JSON.stringify({ url: s.relative_url }) }))),
      { headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const reqs = Array.from({ length: 51 }, (_, i) => ({ relative_url: `p${i}` }));
  const out = await batch<{ url: string }>(reqs);

  // Graph nimmt maximal 50 Sub-Requests pro POST – der Schnitt muss hier liegen.
  expect(calls.map((c) => c.length)).toEqual([50, 1]);
  expect(out).toHaveLength(51);
  expect(calls.flat()).toHaveLength(51);
  expect((out[50] as PromiseFulfilledResult<{ url: string }>).value.url).toBe("p50");
});

test("Batch-Sub-Requests tragen Body, Name und Abhängigkeit", async () => {
  const original = globalThis.fetch;
  let sent: any;
  globalThis.fetch = (async (input: any) => {
    sent = JSON.parse(new URL(String(input)).searchParams.get("batch")!);
    return new Response(JSON.stringify([{ code: 200, body: '{"id":"cr9"}' }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as any;

  try {
    await batch([
      {
        method: "POST",
        relative_url: "act_1/adcreatives",
        name: "cr_0",
        body: { name: "Lea 1", object_story_spec: { page_id: "p1" } },
      },
      {
        method: "POST",
        relative_url: "act_1/ads",
        depends_on: "cr_0",
        body: { creative: { creative_id: "{result=cr_0:$.id}" } },
      },
      // Der schlichte Fall daneben: ein Lesezugriff ohne Nutzlast, ohne Namen,
      // ohne Abhängigkeit.
      { relative_url: "act_1/ads" },
    ]);
  } finally {
    globalThis.fetch = original;
  }

  const body = new URLSearchParams(sent[0].body);
  expect(body.get("name")).toBe("Lea 1");
  expect(body.get("object_story_spec")).toBe('{"page_id":"p1"}');
  // Ohne dieses Feld verschluckt Graph die Antwort des benannten Sub-Requests und
  // mit ihr seinen Platz im Ergebnis-Array – jede Zuordnung danach wäre um eins
  // verschoben.
  expect(sent[0].omit_response_on_success).toBe(false);
  expect(sent[0].name).toBe("cr_0");
  expect(sent[1].depends_on).toBe("cr_0");
  expect(new URLSearchParams(sent[1].body).get("creative")).toBe(
    '{"creative_id":"{result=cr_0:$.id}"}',
  );
  // Ein GET ohne Body schickt auch keinen mit: Graph liest ein vorhandenes,
  // leeres body-Feld als leere Nutzlast und nicht als "keine".
  expect(sent[2]).not.toHaveProperty("body");
  expect(sent[2].method).toBe("GET");
  // Und was keinen Namen trägt, bekommt hier auch keinen – samt der Flagge, die
  // nur zu einem Namen gehört. Ein automatisch vergebener Name wäre kein
  // harmloser Beifang: er zieht omit_response_on_success mit sich und macht aus
  // jedem Sub-Request einen referenzierbaren, dessen Antwort Graph anders
  // behandelt.
  expect(sent[2]).not.toHaveProperty("name");
  expect(sent[2]).not.toHaveProperty("omit_response_on_success");
  expect(sent[2]).not.toHaveProperty("depends_on");
});
