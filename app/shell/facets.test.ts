import { expect, test } from "bun:test";
import { activeChips } from "./facets";

const labels = { channel: "Channel", status: "Status", q: "Search" };

test("Nur gesetzte Facetten werden zu Chips", () => {
  expect(activeChips({ customer: "x", channel: "", q: undefined }, labels)).toEqual([]);
});

test("Ein Chip entfernt genau seinen eigenen Parameter", () => {
  const chips = activeChips({ channel: "facebook", status: "open", customer: "acme" }, labels);
  expect(chips.map((c) => c.label)).toEqual(["Channel: facebook", "Status: open"]);
  // customer ist Scope, keine Facette – und bleibt beim Entfernen erhalten.
  expect(chips[0].href).toBe("?status=open&customer=acme");
  expect(chips[1].href).toBe("?channel=facebook&customer=acme");
});
