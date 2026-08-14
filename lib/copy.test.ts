import { expect, test } from "bun:test";
import { checkCopy, nameTokens, type CopyField, type Notice } from "./copy";

/** Ein Text, der jede Inhaltsregel erfüllt: lang genug, nennt Kunden und Aufruf. */
const goodBody = (n: number) =>
  `Die Herzhalt sucht Verstärkung im Team (${n}). ` +
  "Wir bieten 30 Tage Urlaub, Weihnachtsgeld und ein Team, das zusammenhält. " +
  "Klingt gut? Dann bewirb dich jetzt in unter 60 Sekunden, ganz ohne Lebenslauf.";

const ok = {
  bodies: [goodBody(1), goodBody(2), goodBody(3)],
  titles: ["Pflegekräfte aufgepasst", "Komm zu Herzhalt", "Wir suchen dich"],
  description: "30 Tage Urlaub · Weihnachtsgeld · JobRad",
  business: "Herzhalt Pflegedienst GmbH",
};

const messages = (n: Notice[], field?: CopyField) =>
  n.filter((x) => !field || x.field === field).map((x) => x.message).join(" | ");

test("copy that follows the house style produces no notices at all", () => {
  expect(checkCopy(ok)).toEqual([]);
});

test("an empty form is quiet — nothing is written yet", () => {
  expect(checkCopy({ bodies: [""], titles: [""], description: "", business: "Herzhalt" })).toEqual(
    [],
  );
});

test("identical primary texts are a warning", () => {
  const n = checkCopy({ ...ok, bodies: [goodBody(1), goodBody(1)] });
  expect(n.some((x) => x.level === "warn" && x.field === "bodies")).toBe(true);
  expect(messages(n, "bodies")).toContain("identisch");
});

test("duplicates ignore case and spacing", () => {
  const n = checkCopy({ ...ok, titles: ["Komm zu uns", "  komm   zu uns  "] });
  expect(messages(n, "titles")).toContain("identisch");
});

test("an empty field between filled ones is a warning, because Meta accepts it", () => {
  const n = checkCopy({ ...ok, bodies: [goodBody(1), "", goodBody(2)] });
  const warn = n.find((x) => x.level === "warn" && x.field === "bodies")!;
  expect(warn.message).toContain("1 Primärtextfeld(er) sind leer");
});

test("the client name is expected in the body, never in the headline", () => {
  // 90% der laufenden Anzeigen nennen ihn im Fließtext, nur 13% in der Überschrift –
  // eine Überschriften-Regel wäre gegen die eigene Praxis gerichtet.
  const noName = checkCopy({
    ...ok,
    bodies: ["Wir suchen Verstärkung für unser Team. Bewirb dich jetzt, ganz ohne Lebenslauf und in unter 60 Sekunden."],
    titles: ["Ohne Namen"],
  });
  expect(messages(noName, "bodies")).toContain("Herzhalt Pflegedienst GmbH");
  expect(messages(noName, "titles")).not.toContain("erwähnt");
});

test("generic words in the client name do not count as a mention", () => {
  // Sonst zählte "Pflegedienst" im Fließtext als Nennung und die Regel wäre wertlos.
  expect(nameTokens("Pflegedienst Herzhalt GmbH")).toEqual(["herzhalt"]);
  expect(nameTokens("Ambulante Pflege GmbH")).toEqual([]);
});

test("a name made only of generic words switches the rule off instead of nagging", () => {
  const n = checkCopy({
    ...ok,
    business: "Ambulante Pflege GmbH",
    bodies: [goodBody(1).replace(/Herzhalt/g, "Wir")],
  });
  expect(messages(n, "bodies")).not.toContain("erwähnt");
});

test("a body with no call to action is flagged", () => {
  const n = checkCopy({
    ...ok,
    bodies: [
      "Die Herzhalt ist ein Pflegedienst mit langer Geschichte und einem Team, das seit vielen Jahren zusammenarbeitet und sich gegenseitig trägt.",
    ],
  });
  expect(messages(n, "bodies")).toContain("Bewerbung");
});

test("a very short primary text is flagged against the live distribution", () => {
  const n = checkCopy({ ...ok, bodies: ["Herzhalt sucht dich – bewirb dich jetzt!"] });
  expect(messages(n, "bodies")).toContain("Zeichen");
});

test("one long headline among short ones is NOT flagged — that is the norm", () => {
  // Die erste Fassung meldete genau das und schlug bei 49% der eigenen
  // laufenden Anzeigen an. Ein Creative hat fünf Überschriften; dass eine davon
  // über 40 Zeichen hat, ist der Normalfall.
  const n = checkCopy({
    ...ok,
    titles: [
      "Pflegefachkraft mit Palliative Care Weiterbildung gesucht",
      "Komm zu Herzhalt",
      "Wir suchen dich",
    ],
  });
  expect(messages(n, "titles")).not.toContain("überlebt");
});

test("headlines are flagged only when none of them is short enough", () => {
  const n = checkCopy({
    ...ok,
    titles: [
      "Pflegefachkraft in Vollzeit für unser Team gesucht",
      "Erfahrene Pflegekraft für die Tagespflege gesucht",
    ],
  });
  expect(messages(n, "titles")).toContain("überlebt");
});

test("a single headline long enough to be cut everywhere is flagged", () => {
  const n = checkCopy({
    ...ok,
    titles: [
      "Pflegefachkraft mit Palliative Care Weiterbildung in Voll- oder Teilzeit gesucht",
      "Komm zu Herzhalt",
      "Wir suchen dich",
    ],
  });
  expect(messages(n, "titles")).toContain("in jeder Platzierung abgeschnitten");
});

test("headlines within the display limit are not flagged", () => {
  expect(messages(checkCopy(ok), "titles")).toBe("");
});

test("fewer than three variants is mentioned once per field", () => {
  const n = checkCopy({ ...ok, bodies: [goodBody(1)], titles: ["Komm zu Herzhalt"] });
  expect(messages(n, "bodies")).toContain("Nur 1 Primärtext(e)");
  expect(messages(n, "titles")).toContain("Nur 1 Überschrift(en)");
});

test("a missing description is mentioned once something else is written", () => {
  const n = checkCopy({ ...ok, description: "" });
  expect(n.some((x) => x.field === "description")).toBe(true);
});

test("notices never block — they are all warn or info", () => {
  const n = checkCopy({ bodies: ["x", "x", ""], titles: ["y", "y"], description: "", business: "Herzhalt" });
  expect(n.length).toBeGreaterThan(0);
  expect(n.every((x) => x.level === "warn" || x.level === "info")).toBe(true);
});
