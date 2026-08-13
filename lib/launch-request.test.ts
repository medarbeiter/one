import { expect, test } from "bun:test";
import type { Customer } from "./customers";
import type { AdInput } from "./launch";
import { resolveLaunch, type WizardSubmission } from "./launch-request";

// resolveLaunch() ruft normalerweise listCustomers() auf, das echte
// Netzwerkaufrufe macht (listAssets() -> graph()). deps.listCustomers ersetzt
// das für den Test durch einen Fake – ein Modul-Mock (mock.module) wäre hier
// die Alternative gewesen, wirkt in bun test aber prozessweit über die ganze
// Testdatei hinaus und hätte lib/customers.test.ts seine echten Exporte
// gestohlen (genau das ist einmal passiert und wieder verworfen worden).
const fakeCustomer: Customer = {
  id: "c1",
  name: "Kunde 1",
  page: { id: "p1", name: "Seite", access: "client" },
  adAccounts: [{ id: "act_1", name: "Konto", account_status: 1, currency: "EUR", access: "own" }],
  access: "own",
  issues: [],
};

const deps = { listCustomers: async () => ({ customers: [fakeCustomer], errors: [] }) };

const ugcAd: AdInput = {
  name: "a.mp4",
  type: "ugc",
  asset: { kind: "video", videoId: "v1", fileName: "a.mp4" },
};

const splitAd: AdInput = {
  name: "s.jpg",
  type: "split",
  portrait: { kind: "image", hash: "hp", fileName: "p.jpg" },
  square: { kind: "image", hash: "hs", fileName: "s.jpg" },
};

const base: WizardSubmission = {
  clientId: "c1",
  adAccount: "act_1",
  campaignName: "Kampagne",
  dailyBudgetCents: 1000,
  adSets: [
    {
      name: "Ads",
      addressString: "Hauptstr. 1, Dresden",
      radiusKm: 10,
      formId: "f1",
      bodies: ["b1", "b2"],
      titles: ["t1"],
      description: "d",
      ads: [ugcAd],
    },
  ],
};

test("eine gültige Anzeigengruppe kommt durch", async () => {
  expect(await resolveLaunch(base, deps)).toEqual({ adAccount: "act_1", pageId: "p1" });
});

test("genau fünf Primärtexte und Überschriften sind das erlaubte Maximum, kein Fehler", async () => {
  // Fünf ist Metas dokumentiertes Limit und MAX_ITEMS im Assistenten – eine
  // 5/5-Anzeigengruppe ist der vorgesehene Höchstfall, keine exotische Eingabe.
  // Ohne diesen Test würde ">" versehentlich zu ">=" verkommen können, ohne
  // dass die Testsuite es bemerkt (der Grenzwert war bisher nur von oben
  // gepinnt, nicht von der erlaubten Obergrenze selbst).
  const atMax: WizardSubmission = {
    ...base,
    adSets: [{ ...base.adSets[0], bodies: Array(5).fill("b"), titles: Array(5).fill("t") }],
  };
  expect(await resolveLaunch(atMax, deps)).toEqual({ adAccount: "act_1", pageId: "p1" });
});

test("eine Anzeigengruppe ohne Primärtext oder Überschrift wird vor Meta abgefangen", async () => {
  // needsSecondText() prüft nur UGC-Anzeigen. Eine reine Split-Gruppe ganz
  // ohne Text rutscht daran vorbei und würde erst in buildCreative() werfen –
  // nachdem Kampagne und Anzeigengruppe schon bei Meta angelegt sind.
  const noBodies: WizardSubmission = {
    ...base,
    adSets: [{ ...base.adSets[0], ads: [splitAd], bodies: [], titles: ["t1"] }],
  };
  expect(await resolveLaunch(noBodies, deps)).toEqual({
    error: "„Ads“ braucht mindestens einen Primärtext und eine Überschrift.",
  });

  const noTitles: WizardSubmission = {
    ...base,
    adSets: [{ ...base.adSets[0], ads: [splitAd], bodies: ["b1"], titles: [] }],
  };
  expect(await resolveLaunch(noTitles, deps)).toEqual({
    error: "„Ads“ braucht mindestens einen Primärtext und eine Überschrift.",
  });
});

test("mehr als fünf Primärtexte oder Überschriften wird vor Meta abgefangen", async () => {
  // MAX_ITEMS = 5 gilt nur im Assistenten (ad-set-block.tsx) – ein POST an
  // /api/launch geht daran vorbei, resolveLaunch() ist die einzige serverseitige
  // Prüfung.
  const tooManyBodies: WizardSubmission = {
    ...base,
    adSets: [{ ...base.adSets[0], bodies: Array(6).fill("b") }],
  };
  expect(await resolveLaunch(tooManyBodies, deps)).toEqual({
    error: "„Ads“ hat mehr als fünf Primärtexte oder Überschriften — Meta erlaubt höchstens fünf.",
  });

  const tooManyTitles: WizardSubmission = {
    ...base,
    adSets: [{ ...base.adSets[0], titles: Array(6).fill("t") }],
  };
  expect(await resolveLaunch(tooManyTitles, deps)).toEqual({
    error: "„Ads“ hat mehr als fünf Primärtexte oder Überschriften — Meta erlaubt höchstens fünf.",
  });
});
