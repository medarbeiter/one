import { expect, test } from "bun:test";
import { relativeTime } from "./relative-time";

test("Minuten und Stunden lesen sich als Vergangenheit", () => {
  const now = Date.parse("2026-08-21T12:00:00Z");
  expect(relativeTime("2026-08-21T11:55:00Z", now)).toBe("vor 5 Minuten");
  expect(relativeTime("2026-08-21T09:00:00Z", now)).toBe("vor 3 Stunden");
});
