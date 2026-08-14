import { expect, test } from "bun:test";
import { label } from "./labels";

test("objectives, goals and events read as plain language", () => {
  expect(label("OUTCOME_LEADS")).toBe("Leads");
  expect(label("LEAD_GENERATION")).toBe("Leads maximieren");
  expect(label("IMPRESSIONS")).toBe("Impressionen");
  expect(label("ON_AD")).toBe("Instant-Formular");
  expect(label("EMPLOYMENT")).toBe("Stellenanzeigen");
});

test("countries and placements read as plain language", () => {
  expect(label("DE")).toBe("Deutschland");
  expect(label("facebook")).toBe("Facebook");
  expect(label("stream")).toBe("Instagram-Feed");
  expect(label("story")).toBe("Stories");
});

test("an unknown value is returned unchanged rather than hidden", () => {
  expect(label("SOMETHING_NEW")).toBe("SOMETHING_NEW");
});
