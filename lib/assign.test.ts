/**
 * Der Abgleich entscheidet, was geschrieben wird. Ein zu großzügiges "gilt als
 * zugewiesen" heißt: die App kann die Seite nicht benutzen und merkt es nie.
 */
import { expect, test } from "bun:test";
import { createAssigner, missingAssets, readyIds, type AssignDeps } from "./assign";

const asset = (id: string) => ({ id, name: id });

test("zugewiesen ist nur, wer MANAGE hat", () => {
  const ready = readyIds([
    { id: "a", tasks: ["MANAGE", "ADVERTISE"] },
    { id: "b", tasks: ["ANALYZE"] },
    { id: "c" },
  ]);
  expect([...ready]).toEqual(["a"]);
});

test("was nicht zugewiesen ist, bleibt übrig – und nur das", () => {
  const missing = missingAssets([asset("a"), asset("b"), asset("c")], new Set(["a"]));
  expect(missing.map((m) => m.id)).toEqual(["b", "c"]);
});

/** Ein Portfolio, ein Ist-Zustand, ein Protokoll – mehr braucht der Abgleich nicht. */
function fake(portfolio: string[], assigned: string[], breaks: string[] = []) {
  const calls = { reads: 0, writes: [] as string[] };
  let clock = 0;
  const deps: AssignDeps = {
    listAssets: async () => ({ accounts: [], pages: portfolio.map((id) => ({ id, name: id })) }),
    listAssigned: async () => {
      calls.reads++;
      return assigned.map((id) => ({ id, tasks: ["MANAGE"] }));
    },
    assign: async (id) => {
      calls.writes.push(id);
      if (breaks.includes(id)) throw new Error(`(#10) keine Freigabe für ${id}`);
    },
    now: () => clock,
  };
  return { deps, calls, tick: (ms: number) => (clock += ms) };
}

test("nur das Fehlende wird geschrieben", async () => {
  const { deps, calls } = fake(["a", "b"], ["a"]);
  const out = await createAssigner(deps).run();
  expect(calls.writes).toEqual(["b"]);
  expect(out.assigned.map((a) => a.id)).toEqual(["b"]);
  // Zwei Edges, ein Lauf: der Ist-Zustand kostet zwei Aufrufe, nicht 200.
  expect(calls.reads).toBe(2);
});

test("der zweite Lauf liest den Ist-Zustand nicht erneut", async () => {
  const { deps, calls } = fake(["a", "b"], ["a"]);
  const assigner = createAssigner(deps);
  await assigner.run();
  await assigner.run();
  // Erste Runde schreibt b, zweite weiß es bereits – ohne einen einzigen Aufruf.
  expect(calls.writes).toEqual(["b"]);
  expect(calls.reads).toBe(2);
});

test("nach Ablauf des Merkers wird neu gelesen", async () => {
  const { deps, calls, tick } = fake(["a"], ["a"]);
  const assigner = createAssigner(deps, 1000);
  await assigner.run();
  tick(1000);
  await assigner.run();
  expect(calls.reads).toBe(4);
  expect(calls.writes).toEqual([]);
});

test("ein Fehlschlag wird nicht wiederholt", async () => {
  const { deps, calls } = fake(["a"], [], ["a"]);
  const assigner = createAssigner(deps);
  const first = await assigner.run();
  const second = await assigner.run();
  expect(first.failed.map((f) => f.asset.id)).toEqual(["a"]);
  // Ohne das Parken kostete eine Seite ohne Freigabe bei jedem Seitenaufruf
  // einen POST, und zwar dauerhaft.
  expect(calls.writes).toEqual(["a"]);
  expect(second.skipped).toBe(1);
});

test("force liest neu und vergisst Geparktes", async () => {
  const { deps, calls } = fake(["a"], [], ["a"]);
  const assigner = createAssigner(deps);
  await assigner.run();
  await assigner.run(true);
  expect(calls.writes).toEqual(["a", "a"]);
  expect(calls.reads).toBe(4);
});

test("parallele Läufe teilen sich einen", async () => {
  const { deps, calls } = fake(["a"], []);
  const assigner = createAssigner(deps);
  await Promise.all([assigner.run(), assigner.run(), assigner.run()]);
  // Sonst schreiben drei gleichzeitige Renderings dieselbe Zuweisung dreimal.
  expect(calls.writes).toEqual(["a"]);
});

test("ohne lesbaren Ist-Zustand wird nichts geschrieben", async () => {
  const { deps, calls } = fake(["a"], []);
  deps.listAssigned = async () => {
    throw new Error("(#10) keine Berechtigung");
  };
  await expect(createAssigner(deps).run()).rejects.toThrow("(#10)");
  // Lieber gar nicht zuweisen als blind alles.
  expect(calls.writes).toEqual([]);
});
