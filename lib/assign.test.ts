/**
 * Der Abgleich entscheidet, was geschrieben wird. Ein zu großzügiges "gilt als
 * zugewiesen" heißt: die App kann die Seite nicht benutzen und merkt es nie.
 */
import { expect, test } from "bun:test";
import { missingAssets, readyIds } from "./assign";

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
