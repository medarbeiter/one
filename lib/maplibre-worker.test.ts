import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Der Kachel-Worker der Karte wird aus public/ ausgeliefert (siehe
// app/campaigns/new/location-map.tsx). Nach einem Update von maplibre-gl
// müssen die Kopien nachziehen, sonst passt der Worker nicht mehr zum Modul:
//   cp node_modules/maplibre-gl/dist/maplibre-gl-{worker,shared}.mjs public/maplibre/
test("public/maplibre trägt den Worker der installierten maplibre-gl-Version", () => {
  for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    expect(readFileSync(`public/maplibre/${f}`, "utf8")).toBe(
      readFileSync(`node_modules/maplibre-gl/dist/${f}`, "utf8"),
    );
  }
});
