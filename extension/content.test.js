import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("endings fills E1 and E2 with their different CTA labels and field order", async () => {
  const source = readFileSync(new URL("./content.js", import.meta.url), "utf8");
  const cards = ["E1", "E2"].map((id) => {
    const fields = [
      ["input", "Name"], ["input", "Title"], ["textarea", "Description"],
      ...(id === "E1"
        ? [["label", "Link"], ["input", "url"], ["label", "Call-to-Action"], ["input", "cta"]]
        : [["label", "Call-to-Action-Text"], ["input", "cta"], ["label", "Link"], ["input", "url"]]),
    ].map(([tag, textContent], index) => ({
      tag, textContent, children: [], value: "", index,
      compareDocumentPosition(other) { return other.index > index ? 4 : 2; },
    }));
    const card = {
      innerText: `${id} Zielseite`,
      querySelectorAll(selector) {
        if (selector.includes("radio")) return [];
        if (selector === "*") return fields;
        if (selector === 'input[type="text"]') return fields.filter((f) => f.tag === "input" && f.textContent !== "url");
        return fields.filter((f) => selector.split(",").includes(f.tag));
      },
    };
    fields.forEach((f) => { f.parentElement = card; });
    return { card, fields };
  });
  const spec = { endings: {
    lead: { title: "Lead", description: "We will call", url: "https://example.com/lead", buttonLabel: "Visit" },
    nonLead: { title: "Thanks", description: "Other options", url: "https://example.com/jobs", buttonLabel: "Jobs" },
  } };
  // Execute the real step and finders; replace only browser/animation boundaries.
  const constants = source.slice(source.indexOf("const T ="), source.indexOf("const WAIT_MS"));
  const finders = source.slice(source.indexOf("const norm ="), source.indexOf("function visible"));
  const up = source.slice(source.indexOf("function up("), source.indexOf("async function step("));
  const endings = source.slice(source.indexOf("async function endings("), source.indexOf("/** Ab Schritt"));
  await runInNewContext(`${constants}\n${finders}\n${up}\n${endings}\nendings(spec)`, {
    spec, Node: { DOCUMENT_POSITION_FOLLOWING: 4 }, SETTLE_MS: 0,
    dialog: () => ({ querySelectorAll: () => cards.map(({ fields }) => fields[2]) }),
    visible: () => true, goTo: async () => {}, sleep: async () => {},
    setValue: (field, value) => { field.value = value; },
  });
  for (const [index, ending] of Object.values(spec.endings).entries()) {
    const fields = cards[index].fields;
    expect(fields[1].value).toBe(ending.title);
    expect(fields[2].value).toBe(ending.description);
    expect(fields.find((f) => f.textContent === "url").value).toBe(ending.url);
    expect(fields.find((f) => f.textContent === "cta").value).toBe(ending.buttonLabel);
  }
});
