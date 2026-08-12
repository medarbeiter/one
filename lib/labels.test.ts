import { expect, test } from "bun:test";
import { label } from "./labels";

test("objectives, goals and events read as plain language", () => {
  expect(label("OUTCOME_LEADS")).toBe("Leads");
  expect(label("LEAD_GENERATION")).toBe("Maximise leads");
  expect(label("IMPRESSIONS")).toBe("Impressions");
  expect(label("ON_AD")).toBe("Instant form");
  expect(label("EMPLOYMENT")).toBe("Employment");
});

test("countries and placements read as plain language", () => {
  expect(label("DE")).toBe("Germany");
  expect(label("facebook")).toBe("Facebook");
  expect(label("stream")).toBe("Instagram feed");
  expect(label("story")).toBe("Stories");
});

test("an unknown value is returned unchanged rather than hidden", () => {
  expect(label("SOMETHING_NEW")).toBe("SOMETHING_NEW");
});
