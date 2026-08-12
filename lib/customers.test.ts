/**
 * Der Join ist die einzige Stelle, an der Konfiguration und Portfolio
 * auseinanderlaufen können – genau das prüft dieser Test.
 */
import { expect, test } from "bun:test";

process.env.META_ACCESS_TOKEN = "TEST";
const { joinCustomers } = await import("./customers");

const acc = (id: string, access: "own" | "client" = "client") => ({
  id,
  name: id,
  account_status: 1,
  currency: "EUR",
  access,
});
const page = (id: string, access: "own" | "client" = "client") => ({ id, name: id, access });

test("Konfiguration, Konten und Seiten werden zum Kunden verbunden", () => {
  const [c] = joinCustomers(
    [{ id: "schaekel", name: "Pflegedienst Schäkel", pageId: "p1", igId: "ig1", adAccountIds: ["1", "act_2"] }],
    [acc("act_1"), acc("act_2"), acc("act_9")],
    [page("p1"), page("p9")],
  );
  expect(c.page?.id).toBe("p1");
  expect(c.igId).toBe("ig1");
  // "1" ohne Präfix muss dasselbe Konto treffen wie "act_1".
  expect(c.adAccounts.map((a) => a.id)).toEqual(["act_1", "act_2"]);
  expect(c.issues).toEqual([]);
});

test("Fehlende Assets werden gemeldet, nicht verschluckt", () => {
  const [c] = joinCustomers(
    [{ id: "x", name: "X", pageId: "missing", adAccountIds: ["7"] }],
    [acc("act_1")],
    [page("p1")],
  );
  expect(c.page).toBeUndefined();
  expect(c.adAccounts).toEqual([]);
  expect(c.issues).toHaveLength(2);
  expect(c.issues[0]).toContain("missing");
  expect(c.issues[1]).toContain("act_7");
});

test("Zugriffsart kommt von der Seite, ersatzweise vom ersten Konto", () => {
  const own = joinCustomers(
    [{ id: "a", name: "A", pageId: "p1", adAccountIds: [] }],
    [],
    [page("p1", "own")],
  );
  expect(own[0].access).toBe("own");

  const fallback = joinCustomers(
    [{ id: "b", name: "B", pageId: "nope", adAccountIds: ["1"] }],
    [acc("act_1", "own")],
    [],
  );
  expect(fallback[0].access).toBe("own");
});
