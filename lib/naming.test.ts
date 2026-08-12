import { expect, test } from "bun:test";
import { adSetName, campaignName, formatDate, ROLES } from "./naming";

test("the campaign name follows the agency convention", () => {
  expect(
    campaignName({
      business: "Herzhalt Pflegedienst GmbH",
      roles: ["FK"],
      start: new Date(2026, 7, 12),
      initials: "MH",
    }),
  ).toBe("Herzhalt Pflegedienst GmbH - FK ab 12.08.26 MH (via One)");
});

test("several roles are joined with a slash", () => {
  const n = campaignName({
    business: "X", roles: ["FK", "HK"], start: new Date(2026, 0, 3), initials: "KF",
  });
  expect(n).toBe("X - FK/HK ab 03.01.26 KF (via One)");
});

test("free text is appended after the codes", () => {
  const n = campaignName({
    business: "X", roles: ["FK"], roleFreeText: "inkl. PC-Weiterbildung",
    start: new Date(2026, 0, 3), initials: "KF",
  });
  expect(n).toBe("X - FK inkl. PC-Weiterbildung ab 03.01.26 KF (via One)");
});

test("free text alone works, for roles with no code", () => {
  const n = campaignName({
    business: "X", roles: [], roleFreeText: "Koch",
    start: new Date(2026, 0, 3), initials: "KF",
  });
  expect(n).toBe("X - Koch ab 03.01.26 KF (via One)");
});

test("the year is two digits, unlike formatDate", () => {
  expect(formatDate(new Date(2026, 7, 12))).toBe("12.08.2026");
  expect(
    campaignName({ business: "X", roles: ["FK"], start: new Date(2026, 7, 12), initials: "AB" }),
  ).toContain("ab 12.08.26 ");
});

test("every role code has a label", () => {
  expect(ROLES.length).toBeGreaterThan(0);
  for (const r of ROLES) {
    expect(r.code).toMatch(/^[A-Z]+$/);
    expect(r.label.length).toBeGreaterThan(0);
  }
});

test("no roles and no free text leaves no double space", () => {
  const n = campaignName({
    business: "Herzhalt Pflegedienst GmbH", roles: [], start: new Date(2026, 7, 12), initials: "MH",
  });
  expect(n).toBe("Herzhalt Pflegedienst GmbH - ab 12.08.26 MH (via One)");
  expect(n).not.toContain("  ");
});

test("empty initials leaves no double space", () => {
  const n = campaignName({
    business: "Herzhalt Pflegedienst GmbH", roles: ["FK"], start: new Date(2026, 7, 12), initials: "",
  });
  expect(n).toBe("Herzhalt Pflegedienst GmbH - FK ab 12.08.26 (via One)");
  expect(n).not.toContain("  ");
});

test("the first ad set is Ads, later ones carry the city", () => {
  expect(adSetName(0)).toBe("Ads");
  expect(adSetName(1, "Dresden")).toBe("Ads – Dresden");
  expect(adSetName(1)).toBe("Ads 2");
});
