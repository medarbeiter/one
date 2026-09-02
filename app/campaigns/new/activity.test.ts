import { expect, test } from "bun:test";
import { activitySnapshot, clearActivity, report } from "./activity";

test("report schreibt einen Eintrag über seine id fort und hält die Reihenfolge", () => {
  clearActivity();
  report({ id: "a", label: "A", status: "running" });
  report({ id: "b", label: "B", status: "running" });
  report({ id: "a", label: "A", status: "done", detail: "fertig" });
  expect(activitySnapshot().map((e) => [e.id, e.status, e.detail])).toEqual([
    ["a", "done", "fertig"],
    ["b", "running", undefined],
  ]);
  clearActivity();
  expect(activitySnapshot()).toEqual([]);
});
