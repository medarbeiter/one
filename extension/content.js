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
    leadRow: /^E1\s/, // im Popover von „Formular senden“
    choosePopover: "Zielseite auswählen",
    websiteRadio: "VIEW_WEBSITE",
    // Reihenfolge der Textfelder in einer aufgeklappten Zielseite:
    // Name der Zielseite, Überschrift, Link, Call-to-Action; dazu eine Textarea.
  },
};

const WAIT_MS = 15000;
const SETTLE_MS = 350;
/** Menüs und Untermenüs fahren animiert auf – ein Klick davor trifft ins Leere. */
const MENU_MS = 600;

// ---------- Overlay ----------
// Sichtbar machen, was die Erweiterung tut: ein goldener Zeiger gleitet zum
// Ziel, jeder Klick zieht einen Ring, jedes Feld leuchtet auf, wenn Text
// hineingeht, und die Karte unten rechts nennt Schritt und Fortschritt.
// Alles nur Kosmetik – ohne Wirkung auf den Baukasten und ohne Wartezeit
// außer dem Gleiten (GLIDE_MS), damit das Auge mitkommt.
const GLIDE_MS = 260;
const STEPS = 8;
const style = document.createElement("style");
style.textContent = `
@keyframes mo-ripple { from { transform: translate(-50%,-50%) scale(.3); opacity: .9 } to { transform: translate(-50%,-50%) scale(2.4); opacity: 0 } }
@keyframes mo-glow { 0% { box-shadow: 0 0 0 0 #e1b025cc; opacity: 1 } 70% { box-shadow: 0 0 0 8px #e1b02500; opacity: 1 } 100% { opacity: 0 } }
@keyframes mo-tag { 0% { opacity: 0; transform: translateY(6px) } 15% { opacity: 1; transform: none } 80% { opacity: 1 } 100% { opacity: 0 } }
@keyframes mo-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.mo-cursor { position: fixed; left: 0; top: 0; width: 16px; height: 16px; border-radius: 50%; background: #e1b025; border: 2px solid #231a02;
  box-shadow: 0 2px 10px #e1b02599; z-index: 2147483647; pointer-events: none; opacity: 0;
  transition: transform ${GLIDE_MS}ms cubic-bezier(.2,.8,.2,1), opacity 200ms; will-change: transform }
.mo-ring { position: fixed; width: 28px; height: 28px; border-radius: 50%; border: 3px solid #e1b025; z-index: 2147483646; pointer-events: none;
  animation: mo-ripple 600ms cubic-bezier(.2,.8,.2,1) forwards }
.mo-glow { position: fixed; border-radius: 6px; border: 2px solid #e1b025; z-index: 2147483645; pointer-events: none; animation: mo-glow 900ms ease-out forwards }
.mo-tag { position: fixed; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #231a02; color: #f7edd2;
  font: 12px/1.3 system-ui; padding: 3px 8px; border-radius: 6px; z-index: 2147483647; pointer-events: none; animation: mo-tag 1100ms ease-out forwards }
.mo-panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 360px; background: #faf8f3; color: #1c1917; border: 1px solid #d8d2c6;
  font: 12px/1.45 system-ui; border-radius: 12px; box-shadow: 0 8px 28px #0004; overflow: hidden; animation: mo-in 300ms cubic-bezier(.2,.8,.2,1) }
.mo-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: linear-gradient(#f7edd2, #faf8f3); font-weight: 600; font-size: 13px }
.mo-head .mo-dot { width: 10px; height: 10px; border-radius: 50%; background: #e1b025; box-shadow: 0 0 0 0 #e1b02580; animation: mo-glow 1.4s ease-out infinite }
.mo-bar { height: 3px; background: #ece2c9 } .mo-bar > i { display: block; height: 100%; background: #e1b025; width: 0; transition: width 400ms cubic-bezier(.2,.8,.2,1) }
.mo-log { padding: 8px 12px; white-space: pre-wrap; color: #67625a; max-height: 150px; overflow: hidden }
@media (prefers-reduced-motion: reduce) { .mo-cursor, .mo-bar > i { transition: none } .mo-ring, .mo-glow, .mo-tag, .mo-panel, .mo-dot { animation-duration: 1ms } }`;
document.documentElement.appendChild(style);

const panel = document.createElement("div");
panel.className = "mo-panel";
panel.innerHTML = '<div class="mo-head"><span class="mo-dot"></span><span class="mo-title">Formular bauen</span></div><div class="mo-bar"><i></i></div><div class="mo-log"></div>';
const cursor = document.createElement("div");
cursor.className = "mo-cursor";
const lines = [];
function say(text) {
  lines.push(text);
  if (!panel.isConnected) document.body.append(panel, cursor);
  panel.querySelector(".mo-log").textContent = lines.slice(-6).join("\n");
}
function progress(done, title) {
  if (!panel.isConnected) document.body.append(panel, cursor);
  panel.querySelector(".mo-title").textContent = title;
  panel.querySelector(".mo-bar > i").style.width = `${(100 * done) / STEPS}%`;
  panel.querySelector(".mo-dot").style.animationPlayState = done >= STEPS ? "paused" : "running";
}

const center = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, r };
};
const flash = (cls, css, ms) => {
  const d = document.createElement("div");
  d.className = cls;
  Object.assign(d.style, css);
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
  return d;
};
/** Zeiger zum Ziel gleiten lassen – die einzige Wartezeit, die das Auge braucht. */
async function moveTo(el) {
  if (!cursor.isConnected) document.body.append(panel, cursor);
  const { x, y } = center(el);
  cursor.style.opacity = "1";
  cursor.style.transform = `translate(${x - 8}px, ${y - 8}px)`;
  await sleep(GLIDE_MS + 40);
}
function ripple(el) {
  const { x, y } = center(el);
  flash("mo-ring", { left: `${x}px`, top: `${y}px`, transform: "translate(-50%,-50%)" }, 650);
}
/** Feld leuchtet auf, darüber steht kurz, was hineingeschrieben wurde. */
function glow(el, text) {
  const { x, y, r } = center(el);
  cursor.style.opacity = "1";
  cursor.style.transform = `translate(${x - 8}px, ${y - 8}px)`;
  flash("mo-glow", { left: `${r.x - 3}px`, top: `${r.y - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` }, 950);
  if (text) flash("mo-tag", { left: `${r.x}px`, top: `${Math.max(4, r.y - 28)}px` }, 1150).textContent = `✎ ${text}`;
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
  await moveTo(el);
  ripple(el);
  el.click();
  await sleep(SETTLE_MS);
  return el;
}

/** Menüeinträge reagieren teils auf mousedown, nicht auf click – die ganze Folge schicken. */
async function realClick(el) {
  el.scrollIntoView({ block: "center" });
  await moveTo(el);
  ripple(el);
  const r = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  for (const type of ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup"]) el.dispatchEvent(new MouseEvent(type, init));
  el.click();
  await sleep(SETTLE_MS);
  return el;
}

/** Erst warten, bis der Eintrag da ist, dann die Animation abwarten, dann frisch suchen – der erste Fund ist nach dem Neuzeichnen oft nicht mehr im DOM. */
async function pickAfterAnimation(find, what) {
  await waitFor(find, what);
  await sleep(MENU_MS);
  return realClick(await waitFor(find, what));
}

const clickText = async (texts, opts) => click(await waitFor(() => byText(texts, opts)[0], texts));

/** React-Inputs merken nur Änderungen über den nativen Setter plus input-Event. */
function setValue(input, value) {
  glow(input, value);
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

const pickMenuItem = (text) => pickAfterAnimation(() => openMenuItems().find((o) => norm(o.innerText).startsWith(norm(text))), text);

/** Nach oben bis zum Container, der `test` erfüllt – z. B. die Karte einer Frage. */
function up(el, test, max = 12) {
  let n = el;
  for (let i = 0; i < max && n; i++, n = n.parentElement) if (test(n)) return n;
  return null;
}

// ---------- Schritte ----------
let done = 0;
async function step(name, fn) {
  say(`▶ ${name}`);
  progress(done, name);
  try {
    await fn();
    progress(++done, name);
  } catch (e) {
    panel.querySelector(".mo-title").textContent = `Hält an: ${name}`;
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
  // Das Modal liegt als Portal neben dem Baukasten-Dialog, nicht darin.
  const modal = await waitFor(
    () => up(byText(T.settings.modal, { root: document.body, sel: "*" }).find((el) => el.children.length === 0), (n) => n.querySelector('[role="combobox"]') && n.querySelector("input[type=radio]"), 25),
    T.settings.modal,
  );
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

/** Menü öffnen und Eintrag wählen – öffnet sich nichts (Klick in eine Animation), noch einmal. */
async function addQuestion(kind) {
  for (let attempt = 0; ; attempt++) {
    await clickText(T.questions.add);
    const found = await waitFor(() => openMenuItems().find((o) => norm(o.innerText).startsWith(norm(kind))), kind, 2500).catch(() => null);
    if (found) break;
    if (attempt >= 2) throw new Error(`„${kind}“ erscheint nicht nach „${T.questions.add}“`);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(MENU_MS);
  }
  await pickMenuItem(kind);
}

async function questions(spec) {
  await goTo(T.nav.questions);
  const toggle = await waitFor(() => [...dialog().querySelectorAll('[role="switch"]')].find((s) => norm(s.getAttribute("aria-label")) === norm(T.questions.logic)), T.questions.logic);
  if (toggle.getAttribute("aria-checked") !== "true") {
    await click(toggle);
    await sleep(MENU_MS); // der Hinweis darunter wechselt, die Seite zeichnet neu
  }

  // 1) Alle Fragen anlegen – Beschriftung und Antworten. Die vorige Karte
  //    klappt dabei zu; die Logik kommt in Schritt 2, wenn alle Ziele existieren.
  for (const q of spec.questions) {
    await addQuestion(T.questions.multipleChoice);
    const label = await waitFor(() => byPlaceholder(T.ph.mcLabel).find((i) => !i.value), T.ph.mcLabel);
    await sleep(150);
    setValue(label, q.label);
    const card = up(label, (n) => n !== label && n.querySelector('[role="combobox"]') && optionInputs(n).length);
    for (let i = 0; i < q.options.length; i++) {
      if (optionInputs(card).length <= i) await click(lastPlus(card));
      await sleep(120);
      setValue(optionInputs(card)[i], q.options[i]);
    }
  }
  for (const text of spec.freeText) {
    await addQuestion(T.questions.shortAnswer);
    const label = await waitFor(() => byPlaceholder(T.ph.shortLabel).find((i) => !i.value), T.ph.shortLabel);
    await sleep(150);
    setValue(label, text);
  }

  // 2) Logik. Ausschluss → Formular schließen (E2). Sonst → nächste Frage;
  //    die letzte Frage → Formular senden (E1).
  const all = [...spec.questions.map((q) => ({ ...q, mc: true })), ...spec.freeText.map((label) => ({ label, options: [], disqualify: [], mc: false }))];
  for (let qi = 0; qi < all.length; qi++) {
    const q = all[qi];
    const next = all[qi + 1];
    await expandQuestion(qi + 1);
    await sleep(SETTLE_MS);
    const card = cardOf(await waitFor(() => byPlaceholder(q.mc ? T.ph.mcLabel : T.ph.shortLabel).find((i) => norm(i.value) === norm(q.label)), q.label));
    const combos = q.mc ? optionCombos(card) : [card.querySelector('[role="combobox"]')];
    for (let i = 0; i < combos.length; i++) {
      const outcome = q.mc && q.disqualify.includes(q.options[i]) ? "close" : next ? "question" : "submit";
      await setLogic(combos[i], outcome, next?.label, qi + 2);
    }
  }
}

/**
 * Die zugeklappte Zeile „F3 …“ bzw. „E2 …“: das innerste sichtbare Element,
 * dessen Text mit dem Präfix beginnt und keine andere Nummer enthält – ein
 * äußerer Wrapper fängt zwar mit „F1“ an, ein Klick darauf öffnet aber nichts.
 */
function collapsedRow(prefix) {
  const re = new RegExp(`^${prefix}\\s`, "i");
  const other = new RegExp(`\\b${prefix[0]}\\d+\\s`, "gi");
  const hits = [...dialog().querySelectorAll("*")].filter((el) => {
    if (!visible(el) || el.querySelector("input,textarea")) return false;
    const t = norm(el.innerText);
    return re.test(t) && (t.match(other) ?? []).every((m) => m.trim().toLowerCase() === prefix.toLowerCase());
  });
  return hits.at(-1);
}

async function expandQuestion(n) {
  const row = collapsedRow(`F${n}`);
  if (row) await click(row);
}

async function setLogic(combo, outcome, nextLabel, nextNumber) {
  await click(combo);
  if (outcome === "close") return pickMenuItem(T.questions.close);
  if (outcome === "submit") {
    await pickMenuItem(T.questions.submit);
    // Popover „Zielseite auswählen“ mit Radios: „E1 End page for leads“ und
    // „Neue Zielseite erstellen“ (vorgewählt). Die Beschriftung von E1 anklicken.
    const e1 = () => {
      const pop = up(byText(T.end.choosePopover, { root: document.body, sel: "*" }).find((el) => el.children.length === 0), (n) => n.querySelector('input[type="radio"]'), 25);
      if (!pop) return null;
      const leaf = [...pop.querySelectorAll("*")].filter((el) => visible(el) && el.children.length === 0 && T.end.leadRow.test(norm(el.textContent).toUpperCase()));
      return leaf[0] ?? null;
    };
    await pickAfterAnimation(e1, T.end.choosePopover);
    // Bleibt das Popover offen, schließt Escape es; die Wahl ist dann gesetzt.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(SETTLE_MS);
    return;
  }
  await pickMenuItem(T.questions.goToQuestion);
  // Vorhandene Frage: der Eintrag im Popover, der Nummer oder Beschriftung trägt.
  const entry = () => {
    const pop = up(byText(T.questions.goToQuestionPopover, { root: document.body, sel: "*" })[0], (n) => n.querySelector("input"));
    return pop && [...pop.querySelectorAll('[role="button"],[role="menuitem"],[role="option"],[role="radio"],label')].filter(visible).find((el) => {
      const t = norm(el.innerText);
      return t.includes(norm(nextLabel)) || t.startsWith(`f${nextNumber} `) || t.startsWith(`f${nextNumber}`);
    });
  };
  await pickAfterAnimation(entry, `Frage ${nextNumber} („${nextLabel}“) in „${T.questions.goToQuestionPopover}“`);
}

async function contact(spec) {
  await fillPlaceholder(T.ph.contactHeadline, spec.contact.headline);
  // Die Kontaktzeilen: ein Element, dessen eigener Text genau „Email“ o. ä.
  // ist, darüber die Zeile, neben der der Löschen-Knopf steht (Geschwister).
  const has = (names) => {
    const leaf = byText(names, { sel: "*" }).find((el) => el.children.length === 0);
    return leaf ? up(leaf, (n) => n.parentElement && [...n.parentElement.children].some((s) => s !== n && s.querySelector?.('[role="button"]'))) : null;
  };

  // Das Kategorie-Menü und sein Untermenü sind keine menuitems, nur Text.
  // Das Untermenü öffnet auf Hover; sein Eintrag „Telefonnummer“ ist der, den
  // es vor dem Hover noch nicht gab – die Zeile in der Liste heißt genauso.
  const anyText = (names) => {
    const w = list(names).map(norm);
    return [...document.body.querySelectorAll("*")].filter((el) => visible(el) && w.includes(norm(el.innerText)));
  };
  const hover = (el) => {
    for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "mousemove"])
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  };
  const addField = async (names) => {
    await clickText(T.contact.addCategory);
    const cat = await waitFor(() => anyText(T.contact.contactFields).at(-1), T.contact.contactFields);
    const before = new Set(anyText(names));
    // Nur hovern – ein Klick auf die Kategorie schließt das Menü wieder.
    hover(cat);
    await sleep(MENU_MS);
    hover(cat);
    // Der innerste neue Treffer ist der Eintrag im Untermenü.
    await pickAfterAnimation(() => anyText(names).filter((el) => !before.has(el)).at(-1), names);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(SETTLE_MS);
    if (!has(names)) throw new Error(`„${list(names)[0]}“ wurde nicht in die Liste übernommen`);
  };

  // Telefon zuerst: solange E-Mail das einzige Kontaktfeld ist, bleibt ihr
  // Löschen-Knopf gesperrt. Danach E-Mail raus und wieder rein – so steht
  // sie zuletzt, denn die Reihenfolge ist die des Hinzufügens.
  if (!has(T.contact.phone)) await addField(T.contact.phone);
  const email = has(T.contact.email);
  if (email) {
    const trash = [...email.parentElement.children].filter((s) => s !== email).flatMap((s) => [...s.querySelectorAll('[role="button"]')]).find(visible);
    if (!trash) throw new Error("Löschen-Knopf neben E-Mail nicht gefunden");
    if (trash.getAttribute("aria-disabled") === "true") throw new Error("E-Mail lässt sich nicht löschen – Telefonnummer fehlt noch");
    await realClick(trash);
    await pickAfterAnimation(() => byText(T.contact.confirmDelete, { root: document.body })[0], T.contact.confirmDelete);
  }
  await addField(T.contact.email);
}

async function privacy(spec) {
  await goTo(T.nav.privacy);
  // Zwei Textfelder: Link (leer) und Link-Text (vorbelegt „Visit …“).
  const [link, linkText] = await waitFor(() => {
    const inputs = [...dialog().querySelectorAll('input[type="text"]')].filter(visible);
    return inputs.length >= 2 ? inputs : null;
  }, "Link");
  setValue(link, spec.privacyUrl);
  if (spec.privacyLinkText) setValue(linkText, spec.privacyLinkText);
}

async function endings(spec) {
  await goTo(T.nav.end);
  for (const [rowRe, e] of [
    ["E1", spec.endings.lead],
    ["E2", spec.endings.nonLead],
  ]) {
    // Aufgeklappt hat der Abschnitt genau eine Textarea (Beschreibung) und vier
    // Textfelder: Name, Überschrift, Link, Call-to-Action. Zugeklappte Zeilen
    // haben keine Felder – also reicht der Blick auf den ganzen Dialog.
    // Bleibt E1 offen, während E2 aufklappt, zählt die letzte Textarea – E2
    // liegt im Dokument hinter E1. Die Textfelder: zwei davor (Name,
    // Überschrift), zwei danach (Link, Call-to-Action).
    const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const fields = () => {
      const ta = [...dialog().querySelectorAll("textarea")].filter(visible).at(-1);
      if (!ta) return null;
      const all = [...dialog().querySelectorAll('input[type="text"]')].filter(visible);
      const idx = all.findIndex((i) => after(ta, i));
      if (idx < 2 || all.length < idx + 2) return null;
      return { ta, inputs: all.slice(idx - 2, idx + 2) };
    };
    for (let attempt = 0; !fields(); attempt++) {
      if (attempt >= 3) throw new Error(`Zielseite „${rowRe}“ klappt nicht auf`);
      await realClick(await waitFor(() => collapsedRow(rowRe), rowRe));
      await waitFor(fields, "Zielseite", 3000).catch(() => null);
    }
    const { ta, inputs } = fields();
    const website = [...dialog().querySelectorAll(`input[type="radio"][value="${T.end.websiteRadio}"]`)].filter(visible).find((r) => after(ta, r));
    if (website && !website.checked) await click(website);
    setValue(inputs[1], e.title);
    setValue(ta, e.description);
    setValue(inputs[2], e.url);
    setValue(inputs[3], e.buttonLabel);
    await sleep(SETTLE_MS);
    // Zuklappen, damit die zweite Zielseite allein ihre Felder zeigt.
    const head = collapsedRow(rowRe) ?? [...dialog().querySelectorAll("*")].find((el) => visible(el) && el.children.length === 0 && new RegExp(`^${rowRe}\\s`, "i").test(norm(el.textContent)));
    if (head) await realClick(head);
    await sleep(SETTLE_MS);
  }
}

async function build(spec) {
  lines.length = 0;
  done = 0;
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
  progress(STEPS, "Fertig – bitte prüfen");
  cursor.style.opacity = "0";
  say("✔ Fertig. Bitte prüfen, dann „Formular erstellen“ selbst klicken – zurück im Assistenten wird es erkannt.");
}

// ---------- Start ----------
// Drei Wege zur Vorlage: der Knopf in der App (chrome.storage.local, über
// background.js), der URL-Hash (capture.js → sessionStorage) und das Popup.
let running = false;
async function run(json) {
  if (running) return "läuft schon";
  const stored = await chrome.storage.local.get(["mo_form", "mo_form_done"]);
  const text = json ?? (stored.mo_form && !stored.mo_form_done ? stored.mo_form : null) ?? sessionStorage.getItem("mo_form");
  if (!text) return "keine Vorlage – in /campaigns/new „In Meta bauen“ klicken oder JSON einfügen";
  sessionStorage.setItem("mo_form", text);
  running = true;
  try {
    await build(JSON.parse(text));
    await chrome.storage.local.set({ mo_form_done: true });
  } catch (e) {
    console.warn("[mo_form]", e);
    if (!lines.some((l) => l.startsWith("✖"))) say(`✖ ${e.message}`);
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

chrome.storage.local
  .get(["mo_form", "mo_form_done"])
  .then((s) => {
    const pending = (s.mo_form && !s.mo_form_done) || (sessionStorage.getItem("mo_form") && !sessionStorage.getItem("mo_form_done"));
    if (pending) return run();
  })
  .catch((e) => say(`✖ Start: ${e.message}`));
