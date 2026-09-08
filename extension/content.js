// Tippt die Vorlage (lib/form-spec.ts → FormSpec) im Meta-Baukasten ab.
//
// Abgelesen am echten Baukasten (Business Suite, deutsch, 2026-09-08). Der
// Baukasten ist eine React-App ohne stabile IDs oder Klassen; gefunden wird
// über sichtbaren Text, aria-Beschriftungen und Platzhalter – alle stehen in
// T und dürfen dort kalibriert werden, sonst nirgends. Jeder Schritt hält bei
// der ersten Beschriftung an, die er nicht findet, und sagt im Overlay welche.
//
// Was hier bewusst fehlt: „Formular erstellen“ am Ende. Der letzte Klick bleibt
// beim Menschen, damit ein halb gebautes Formular nie unbemerkt aktiv wird.
//
// Reihenfolge ist Absicht: erst die Sprache, denn die Kontaktfelder heißen je
// nach Formularsprache „Email“/„Phone number“ oder „E-Mail-Adresse“/
// „Telefonnummer“ – T.contact führt deshalb beide.

const T = {
  library: {
    create: ["Formular erstellen"],
    fresh: ["Neues Formular"],
    next: ["Weiter"],
  },
  nav: {
    type: "Formulartyp",
    intro: "Intro",
    questions: "Fragen",
    privacy: "Datenschutzrichtlinie",
    end: "Ende",
  },
  settings: {
    open: "Einstellungen",
    modal: "Formulareinstellungen",
    german: "Deutsch",
    // input[type=radio] value: true = Eingeschränkt, false = Offen
    openValue: "false",
    done: "Fertig",
  },
  ph: {
    name: "Gib einen Namen für dein Formular ein",
    introTitle: "Gib einen kurzen Titel ein",
    introText: "Füge zusätzliche Informationen hinzu",
    mcLabel: "Beispiel: Wie bald möchtest du etwas kaufen?",
    option: "Gib eine Antwort ein",
    shortLabel: "Gib eine Kurzantwort-Frage ein",
    contactHeadline: "Gib eine Nachricht ein",
    goToQuestionText: "Gib eine Frage ein",
  },
  questions: {
    logic: "Bedingte Logik", // aria-label des Schalters
    add: "Frage hinzufügen",
    multipleChoice: "Multiple-Choice-Frage",
    shortAnswer: "Kurze Antwort",
    nextStep: "Nächsten Schritt auswählen",
    goToQuestion: "Zu einer Frage",
    goToQuestionPopover: "Weiter zu einer Frage",
    submit: "Formular senden",
    close: "Formular schließen",
    collapsedRow: /^F\d+\s/, // „F1 Frage Antwort oder Logik hinzufügen“
  },
  contact: {
    addCategory: "Kategorie hinzufügen",
    contactFields: "Felder für Kontaktdaten",
    email: ["Email", "E-Mail-Adresse", "E-Mail"],
    phone: ["Phone number", "Telefonnummer"],
    confirmDelete: "Löschen",
  },
  end: {
    leadRow: /^E1\s/,
    nonLeadRow: /^E2\s/,
    websiteRadio: "VIEW_WEBSITE",
    // Reihenfolge der Textfelder in einer aufgeklappten Zielseite:
    // Name der Zielseite, Überschrift, Link, Call-to-Action; dazu eine Textarea.
  },
};

const WAIT_MS = 15000;
const SETTLE_MS = 350;

// ---------- Overlay ----------
const box = document.createElement("div");
box.style.cssText =
  "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:380px;background:#111;color:#fff;" +
  "font:12px/1.4 system-ui;padding:10px 12px;border-radius:8px;white-space:pre-wrap;box-shadow:0 4px 20px #0006";
const lines = [];
function say(text) {
  lines.push(text);
  box.textContent = lines.slice(-9).join("\n");
  if (!box.isConnected) document.body.appendChild(box);
}

// ---------- Finder ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s ?? "").replace(/​/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const list = (x) => (Array.isArray(x) ? x : [x]);

function visible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

const dialog = () => document.querySelector('[role="dialog"]') ?? document.body;

/** Sichtbare Elemente, deren Text (innerText) genau einem Kandidaten entspricht – bzw. ihn enthält. */
function byText(texts, { root = dialog(), sel = '[role="button"],button,[role="menuitem"],[role="option"],[role="radio"],label,a', exact = true } = {}) {
  const wanted = list(texts).map(norm);
  return [...root.querySelectorAll(sel)].filter((el) => {
    if (!visible(el)) return false;
    const t = norm(el.innerText);
    return t && wanted.some((w) => (exact ? t === w : t.startsWith(w) || t.includes(w)));
  });
}

function byPlaceholder(ph, root = dialog()) {
  return [...root.querySelectorAll("input,textarea")].filter((el) => visible(el) && norm(el.placeholder).startsWith(norm(ph)));
}

async function waitFor(fn, what, ms = WAIT_MS) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(150);
  }
  throw new Error(`„${list(what)[0]}“ nicht gefunden`);
}

async function click(el) {
  el.scrollIntoView({ block: "center" });
  el.click();
  await sleep(SETTLE_MS);
  return el;
}

const clickText = async (texts, opts) => click(await waitFor(() => byText(texts, opts)[0], texts));

/** React-Inputs merken nur Änderungen über den nativen Setter plus input-Event. */
function setValue(input, value) {
  input.focus();
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.blur();
}

async function fillPlaceholder(ph, value, root) {
  const input = await waitFor(() => byPlaceholder(ph, root)[0], ph);
  setValue(input, value);
  await sleep(200);
  return input;
}

/** Das Menü/Listbox, das gerade offen ist – Meta rendert es außerhalb des Dialogs. */
const openMenuItems = () => [...document.querySelectorAll('[role="menuitem"],[role="option"]')].filter(visible);

async function pickMenuItem(text) {
  const item = await waitFor(() => openMenuItems().find((o) => norm(o.innerText).startsWith(norm(text))), text);
  return click(item);
}

/** Nach oben bis zum Container, der `test` erfüllt – z. B. die Karte einer Frage. */
function up(el, test, max = 12) {
  let n = el;
  for (let i = 0; i < max && n; i++, n = n.parentElement) if (test(n)) return n;
  return null;
}

// ---------- Schritte ----------
async function step(name, fn) {
  say(`▶ ${name}`);
  try {
    await fn();
  } catch (e) {
    say(`✖ ${name}: ${e.message}\nBeschriftung in extension/content.js (T) prüfen, dann Popup → „Erneut“.`);
    throw e;
  }
}

async function openBuilder() {
  if (byText(T.nav.end).length && byText(T.nav.type).length) return; // Baukasten ist schon offen
  await clickText(T.library.create, { root: document.body });
  await clickText(T.library.fresh, { root: document.body }).catch(() => {});
  await clickText(T.library.next, { root: document.body }).catch(() => {});
  await waitFor(() => byText(T.nav.questions)[0], T.nav.questions);
}

const goTo = (section) => clickText(section);

async function settings() {
  await clickText(T.settings.open);
  const modal = await waitFor(() => up(byText(T.settings.modal, { sel: "*" })[0], (n) => n.querySelector('[role="combobox"]') && n.querySelector("input[type=radio]")), T.settings.modal);
  await click(modal.querySelector('[role="combobox"]'));
  await pickMenuItem(T.settings.german);
  await click(modal.querySelector(`input[type=radio][value="${T.settings.openValue}"]`));
  await clickText(T.settings.done, { root: modal });
}

async function formType(spec) {
  await goTo(T.nav.type);
  await fillPlaceholder(T.ph.name, spec.name);
}

async function intro(spec) {
  await goTo(T.nav.intro);
  await fillPlaceholder(T.ph.introTitle, spec.intro.title);
  await fillPlaceholder(T.ph.introText, spec.intro.description);
}

/** Die Karte einer Frage: der nächste Vorfahr des Beschriftungsfelds, der auch die Logik-Combobox trägt. */
const cardOf = (input) => up(input, (n) => n !== input && n.querySelector('[role="combobox"]'));

/**
 * Eine MC-Karte hat zwei Spalten: links die Antwortfelder, rechts je Antwort
 * eine Combobox und die Knöpfe − und +. Zusammengehörig ist, was denselben
 * Index hat; der +-Knopf der letzten Zeile ist der letzte Icon-Knopf der Karte.
 */
const optionInputs = (card) => byPlaceholder(T.ph.option, card);
const optionCombos = (card) => [...card.querySelectorAll('[role="combobox"]')].filter(visible);
const lastPlus = (card) => [...card.querySelectorAll('[role="button"]')].filter((b) => visible(b) && b.querySelector("svg") && !norm(b.innerText)).at(-1);

async function addQuestion(kind) {
  await clickText(T.questions.add);
  await pickMenuItem(kind);
}

async function questions(spec) {
  await goTo(T.nav.questions);
  const toggle = await waitFor(() => [...dialog().querySelectorAll('[role="switch"]')].find((s) => norm(s.getAttribute("aria-label")) === norm(T.questions.logic)), T.questions.logic);
  if (toggle.getAttribute("aria-checked") !== "true") await click(toggle);

  // 1) Alle Fragen anlegen – Beschriftung und Antworten. Die vorige Karte
  //    klappt dabei zu; die Logik kommt in Schritt 2, wenn alle Ziele existieren.
  for (const q of spec.questions) {
    await addQuestion(T.questions.multipleChoice);
    const label = await waitFor(() => byPlaceholder(T.ph.mcLabel).find((i) => !i.value), T.ph.mcLabel);
    setValue(label, q.label);
    const card = up(label, (n) => n !== label && n.querySelector('[role="combobox"]') && optionInputs(n).length);
    for (let i = 0; i < q.options.length; i++) {
      if (optionInputs(card).length <= i) await click(lastPlus(card));
      setValue(optionInputs(card)[i], q.options[i]);
    }
  }
  for (const text of spec.freeText) {
    await addQuestion(T.questions.shortAnswer);
    const label = await waitFor(() => byPlaceholder(T.ph.shortLabel).find((i) => !i.value), T.ph.shortLabel);
    setValue(label, text);
  }

  // 2) Logik. Ausschluss → Formular schließen (E2). Sonst → nächste Frage;
  //    die letzte Frage → Formular senden (E1).
  const all = [...spec.questions.map((q) => ({ ...q, mc: true })), ...spec.freeText.map((label) => ({ label, options: [], disqualify: [], mc: false }))];
  for (let qi = 0; qi < all.length; qi++) {
    const q = all[qi];
    const next = all[qi + 1];
    await expandQuestion(qi + 1);
    const card = cardOf(await waitFor(() => byPlaceholder(q.mc ? T.ph.mcLabel : T.ph.shortLabel).find((i) => norm(i.value) === norm(q.label)), q.label));
    const combos = q.mc ? optionCombos(card) : [card.querySelector('[role="combobox"]')];
    for (let i = 0; i < combos.length; i++) {
      const outcome = q.mc && q.disqualify.includes(q.options[i]) ? "close" : next ? "question" : "submit";
      await setLogic(combos[i], outcome, next?.label, qi + 2);
    }
  }
}

/** Zugeklappte Frage „F3 …“ aufklappen – die offene hat kein solches Kopfzeilen-Element. */
async function expandQuestion(n) {
  // Mehrere verschachtelte Treffer tragen denselben Text – der Klick steigt ohnehin zur Zeile auf.
  const row = byText(`F${n} `, { sel: "*", exact: false }).find((el) => T.questions.collapsedRow.test(norm(el.innerText).toUpperCase()) && el.children.length <= 3);
  if (row) await click(row);
}

async function setLogic(combo, outcome, nextLabel, nextNumber) {
  await click(combo);
  if (outcome === "close") return pickMenuItem(T.questions.close);
  if (outcome === "submit") {
    await pickMenuItem(T.questions.submit);
    // Untermenü mit den Zielseiten – die Lead-Seite ist E1.
    await sleep(SETTLE_MS);
    const e1 = openMenuItems().find((o) => T.end.leadRow.test(norm(o.innerText).toUpperCase())) ?? openMenuItems()[0];
    if (e1) await click(e1);
    return;
  }
  await pickMenuItem(T.questions.goToQuestion);
  const pop = await waitFor(() => up(byText(T.questions.goToQuestionPopover, { root: document.body, sel: "*" })[0], (n) => n.querySelector("input")), T.questions.goToQuestionPopover);
  // Vorhandene Frage: der Eintrag, der Nummer oder Beschriftung trägt.
  const entry = [...pop.querySelectorAll('[role="button"],[role="menuitem"],[role="option"],[role="radio"],label')]
    .filter(visible)
    .find((el) => {
      const t = norm(el.innerText);
      return t.includes(norm(nextLabel)) || t.startsWith(`f${nextNumber} `) || t.startsWith(`f${nextNumber}`);
    });
  if (!entry) throw new Error(`Frage ${nextNumber} („${nextLabel}“) steht nicht in „${T.questions.goToQuestionPopover}“`);
  await click(entry);
}

async function contact(spec) {
  await fillPlaceholder(T.ph.contactHeadline, spec.contact.headline);
  // Die Kontaktzeilen: ein Element, dessen eigener Text genau „Email“ o. ä.
  // ist, darüber die Zeile, neben der der Löschen-Knopf steht (Geschwister).
  const has = (names) => {
    const leaf = byText(names, { sel: "*" }).find((el) => el.children.length === 0);
    return leaf ? up(leaf, (n) => n.parentElement && [...n.parentElement.children].some((s) => s !== n && s.querySelector?.('[role="button"]'))) : null;
  };

  const addField = async (names) => {
    await clickText(T.contact.addCategory);
    const cat = await waitFor(() => openMenuItems().find((o) => norm(o.innerText).startsWith(norm(T.contact.contactFields))), T.contact.contactFields);
    cat.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    cat.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await sleep(SETTLE_MS);
    const item = await waitFor(() => openMenuItems().find((o) => names.map(norm).includes(norm(o.innerText))), names);
    await click(item);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(SETTLE_MS);
  };

  // Telefon zuerst: solange E-Mail das einzige Kontaktfeld ist, bleibt ihr
  // Löschen-Knopf gesperrt. Danach E-Mail raus und wieder rein – so steht
  // sie zuletzt, denn die Reihenfolge ist die des Hinzufügens.
  if (!has(T.contact.phone)) await addField(T.contact.phone);
  const email = has(T.contact.email);
  if (email) {
    const trash = [...email.parentElement.children].filter((s) => s !== email).flatMap((s) => [...s.querySelectorAll('[role="button"]')]).find(visible);
    if (!trash) throw new Error("Löschen-Knopf neben E-Mail nicht gefunden");
    await click(trash);
    await clickText(T.contact.confirmDelete, { root: document.body });
  }
  await addField(T.contact.email);
}

async function privacy(spec) {
  await goTo(T.nav.privacy);
  // Zwei Textfelder: Link (leer) und Link-Text (vorbelegt „Visit …“).
  const [link] = await waitFor(() => {
    const inputs = [...dialog().querySelectorAll('input[type="text"]')].filter(visible);
    return inputs.length >= 2 ? inputs : null;
  }, "Link");
  setValue(link, spec.privacyUrl);
}

async function endings(spec) {
  await goTo(T.nav.end);
  for (const [rowRe, e] of [
    [T.end.leadRow, spec.endings.lead],
    [T.end.nonLeadRow, spec.endings.nonLead],
  ]) {
    const row = await waitFor(() => byText("E", { sel: "*", exact: false }).find((el) => rowRe.test(norm(el.innerText).toUpperCase()) && el.children.length <= 4 && !el.querySelector("input")), rowRe.source);
    await click(row);
    // Aufgeklappt: Textfelder Name, Überschrift, Link, Call-to-Action; Textarea = Beschreibung.
    const card = await waitFor(() => {
      const ta = [...dialog().querySelectorAll("textarea")].filter(visible)[0];
      return ta && up(ta, (n) => n.querySelectorAll('input[type="text"]').length >= 4);
    }, "Zielseite");
    const inputs = [...card.querySelectorAll('input[type="text"]')].filter(visible);
    const website = card.querySelector(`input[type="radio"][value="${T.end.websiteRadio}"]`);
    if (website && !website.checked) await click(website);
    setValue(inputs[1], e.title);
    setValue(card.querySelector("textarea"), e.description);
    setValue(inputs[2], e.url);
    setValue(inputs[3], e.buttonLabel);
    await sleep(SETTLE_MS);
  }
}

async function build(spec) {
  lines.length = 0;
  say(`Vorlage „${spec.name}“ – ${spec.questions.length} Fragen`);
  await step("Baukasten öffnen", openBuilder);
  await step("Einstellungen: Deutsch, Offen", settings);
  await step("Formulartyp: Name", () => formType(spec));
  await step("Intro", () => intro(spec));
  await step("Fragen und Logik", () => questions(spec));
  await step("Kontaktinformationen", () => contact(spec));
  await step("Datenschutz", () => privacy(spec));
  await step("Zielseiten", () => endings(spec));
  sessionStorage.setItem("mo_form_done", "1");
  say("✔ Fertig. Bitte prüfen, dann „Formular erstellen“ selbst klicken – zurück im Assistenten wird es erkannt.");
}

// ---------- Start ----------
let running = false;
async function run(json) {
  if (running) return "läuft schon";
  const text = json ?? sessionStorage.getItem("mo_form");
  if (!text) return "keine Vorlage – in /campaigns/new „In Meta bauen“ klicken oder JSON einfügen";
  sessionStorage.setItem("mo_form", text);
  running = true;
  try {
    await build(JSON.parse(text));
  } catch (e) {
    console.warn("[mo_form]", e);
  } finally {
    running = false;
  }
  return lines.join("\n");
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "mo_build") return;
  sessionStorage.removeItem("mo_form_done");
  run(msg.spec).then(reply);
  return true;
});

if (sessionStorage.getItem("mo_form") && !sessionStorage.getItem("mo_form_done")) run();
