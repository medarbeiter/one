import { expect, test } from "bun:test";
import { parseBody, roleLabels } from "./bodies";

test("parseBody nimmt reinen Text und streift Zaun und Anführungszeichen ab", () => {
  expect(parseBody("Du bist Pflegefachkraft?\n\nDann komm zu uns.")).toBe(
    "Du bist Pflegefachkraft?\n\nDann komm zu uns.",
  );
  expect(parseBody('```\n"Komm zu uns."\n```')).toBe("Komm zu uns.");
  expect(parseBody("„Komm zu uns.“")).toBe("Komm zu uns.");
  expect(() => parseBody("```\n```")).toThrow("keinen Text");
});

test("roleLabels übersetzt Kürzel und hängt den Freitext an", () => {
  expect(roleLabels(["PFK", "PDL"], " Koch ")).toEqual([
    "Pflegefachkraft",
    "Pflegedienstleitung",
    "Koch",
  ]);
  expect(roleLabels(["unbekannt"], "")).toEqual([]);
});
