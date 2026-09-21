import { expect, test } from "bun:test";
import { formatAddress } from "./geocode";

test("Adresse wie getippt: Straße Nummer, PLZ Stadt", () => {
  expect(
    formatAddress({ street: "Valentinskamp", housenumber: "88", postcode: "20355", city: "Hamburg", name: "Büro" }),
  ).toBe("Valentinskamp 88, 20355 Hamburg");
  // Ein Dorf ohne Straße heißt nicht zweimal so.
  expect(formatAddress({ name: "Kleinort", postcode: "01234", city: "Kleinort" })).toBe("01234 Kleinort");
  expect(formatAddress({ name: "Waldstück", district: "Heide" })).toBe("Waldstück, Heide");
  expect(formatAddress({})).toBeUndefined();
});
