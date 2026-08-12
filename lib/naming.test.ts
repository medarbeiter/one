import { expect, test } from "bun:test";
import { adSetName, campaignName } from "./naming";

test("campaign name follows the SOP pattern", () => {
  expect(
    campaignName({
      customer: "Palliativo",
      position: "FK inkl. PC-Weiterbildung",
      start: new Date(2026, 7, 6),
      initials: "KF",
    }),
  ).toBe("Palliativo - ges. FK inkl. PC-Weiterbildung ab 06.08.2026 KF");
});

test("day and month are zero padded", () => {
  const n = campaignName({
    customer: "X", position: "P", start: new Date(2026, 0, 3), initials: "AB",
  });
  expect(n).toContain("ab 03.01.2026");
});

test("the first ad set is Ads, later ones carry the city", () => {
  expect(adSetName(0)).toBe("Ads");
  expect(adSetName(1, "Dresden")).toBe("Ads – Dresden");
  expect(adSetName(1)).toBe("Ads 2");
});
