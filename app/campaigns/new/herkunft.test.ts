import { expect, test } from "bun:test";
import { herkunftLabel } from "./herkunft";

test("herkunftLabel: eine Quelle wie bisher, mehrere in der gegebenen Reihenfolge verbunden", () => {
  expect(herkunftLabel("clickup")).toBe("aus ClickUp");
  expect(herkunftLabel(["onboarding"])).toBe("aus der Onboarding-Tabelle");
  expect(herkunftLabel(["clickup", "onboarding"])).toBe("aus ClickUp + Onboarding");
  expect(herkunftLabel(["user", "clickup"])).toBe("aus deinem Hinweis + ClickUp");
  expect(herkunftLabel(["user"])).toBe("aus deinem Hinweis");
  expect(herkunftLabel([])).toBeUndefined();
  expect(herkunftLabel(undefined)).toBeUndefined();
});
