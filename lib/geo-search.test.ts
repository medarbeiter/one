import { expect, test } from "bun:test";
import { fitReachRadius, type Reach } from "./geo-search";

const byRadius = (table: Record<number, number>) => async (km: number): Promise<Reach> =>
  km in table ? { ready: true, lower: table[km], upper: table[km] * 1.2 } : { ready: false };

test("fitReachRadius steigt die Leiter, bis 150 000 Menschen erreicht sind", async () => {
  const asked: number[] = [];
  const out = await fitReachRadius(async (km) => {
    asked.push(km);
    return byRadius({ 17: 60_000, 20: 90_000, 25: 160_000 })(km);
  });
  expect(asked).toEqual([17, 20, 25]);
  expect(out).toMatchObject({ radiusKm: 25, enough: true });
});

test("fitReachRadius beginnt beim größeren Startwert und bleibt bei 80 km stehen", async () => {
  const out = await fitReachRadius(byRadius({ 65: 100_000, 80: 120_000 }), 60);
  expect(out).toMatchObject({ radiusKm: 80, enough: false });
});

test("fitReachRadius: 17 km reichen schon → ein Aufruf", async () => {
  const out = await fitReachRadius(byRadius({ 17: 400_000 }));
  expect(out).toMatchObject({ radiusKm: 17, enough: true });
});
