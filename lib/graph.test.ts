/**
 * bun test – die Stellen, die still kaputtgehen: Parameter-Serialisierung,
 * Fehler-Einordnung und der Retry bei Rate-Limits.
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
process.env.META_AD_ACCOUNT_ID = "act_1";

const { graph, actId, mapGraphError, GraphError } = await import("./graph");

test("Konto-IDs bekommen das act_-Präfix, doppelt aber nicht", () => {
  expect(actId("61593202229799")).toBe("act_61593202229799");
  expect(actId("act_61593202229799")).toBe("act_61593202229799");
  expect(actId("")).toBe("");
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
  expect(graph("y")).rejects.toThrow("no perm");
  expect(n).toBe(1);
});

test("Fehler tragen ihre Einordnung mit", async () => {
  stub(() => ({ status: 401, body: { error: { code: 190, message: "expired" } } }));
  const err = await graph("z").catch((e) => e);
  expect(err).toBeInstanceOf(GraphError);
  expect(err.kind).toBe("token");
});
