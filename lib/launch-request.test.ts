import { expect, test } from "bun:test";
import type { Customer } from "./customers";
import { GraphError, LESS_PERSONALIZED_ADS } from "./graph";
import type { AdInput } from "./launch";
import { resolveLaunch, type WizardSubmission } from "./launch-request";

// resolveLaunch() ruft normalerweise listCustomers() auf, das echte
// Netzwerkaufrufe macht (listAssets() -> graph()). deps.listCustomers ersetzt
// das für den Test durch einen Fake – ein Modul-Mock (mock.module) wäre hier
// die Alternative gewesen, wirkt in bun test aber prozessweit über die ganze
// Testdatei hinaus und hätte lib/customers.test.ts seine echten Exporte
// gestohlen (genau das ist einmal passiert und wieder verworfen worden).
const fakeCustomer: Customer = {
  source: "p1",
  id: "c1",
  name: "Kunde 1",
  page: { id: "p1", name: "Seite", access: "client" },
  adAccounts: [{ id: "act_1", name: "Konto", account_status: 1, currency: "EUR", access: "own" }],
  access: "own",
  issues: [],
};

// estimateReach(), graph() und batch() aus demselben Grund: Standort-,
// Identitäts- und Creative-Prüfung fragen sonst Meta. Die PBIA-Edge antwortet
// mit einer Id: base hat kein Instagram-Konto, also holt resolveLaunch() die
// Instagram-Identität der Seite, bevor irgendetwas anderes gefragt wird.
const pbiaAnswer = (path: string): any =>
  path.endsWith("page_backed_instagram_accounts") ? { data: [{ id: "pbia1" }] } : undefined;
const deps = {
  listCustomers: async () => ({ customers: [fakeCustomer], errors: [], issues: [] }),
  estimateReach: async () => ({ ready: true as const, lower: 100_000, upper: 200_000 }),
  graph: (async (path: string) => pbiaAnswer(path) ?? { success: true }) as any,
  batch: (async (reqs: any[]) =>
    reqs.map(() => ({ status: "fulfilled" as const, value: { success: true } }))) as any,
};

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
      radiusKm: 17,
      formId: "f1",
      bodies: ["b1", "b2"],
      titles: ["t1"],
      description: "d",
      ads: [ugcAd],
    },
  ],
};

test("eine gültige Anzeigengruppe kommt durch", async () => {
  expect(await resolveLaunch(base, deps)).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
});

test("ein Radius, den Meta nicht annimmt, hält vor der ersten Anfrage auf", async () => {
  // buildTargeting() wirft dieselbe Prüfung erst beim Anlegen der
  // Anzeigengruppe – dann steht die Kampagne schon bei Meta und der zu kleine
  // Radius kostet einen Retry statt einer Meldung.
  const zuKlein = {
    ...base,
    adSets: [
      {
        ...base.adSets[0],
        radiusKm: 5,
        place: { type: "city" as const, key: "560419", name: "Hamburg" },
      },
    ],
  };
  expect(await resolveLaunch(zuKlein, deps)).toEqual({
    error: "„Ads“: Radius muss zwischen 17 und 80 km liegen.",
  });

  // Auch um eine Adresse: Facebook lehnt beim Anlegen alles unter 17 km ab.
  expect(
    await resolveLaunch({ ...base, adSets: [{ ...base.adSets[0], radiusKm: 5 }] }, deps),
  ).toEqual({ error: "„Ads“: Radius muss zwischen 17 und 80 km liegen." });
});

test("eine Anzeigengruppe ohne Adresse braucht einen Ort", async () => {
  const leer = { ...base, adSets: [{ ...base.adSets[0], addressString: "  " }] };
  expect(await resolveLaunch(leer, deps)).toHaveProperty("error");
  // Ein gewählter Ort ersetzt die Adresse vollständig.
  const mitOrt = {
    ...base,
    adSets: [
      {
        ...base.adSets[0],
        addressString: "",
        radiusKm: 20,
        place: { type: "city" as const, key: "560419", name: "Hamburg" },
      },
    ],
  };
  expect(await resolveLaunch(mitOrt, deps)).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
});

test("eine Seite ohne angenommene Lead-Bedingungen wird vor Meta abgefangen", async () => {
  // Ohne diese Prüfung entstünden Kampagne und Anzeigengruppe bei Meta, und
  // erst jedes Creative danach fiele durch – ein Zustand, den kein Retry heilt.
  const ohneTos = {
    listCustomers: async () => ({
      customers: [
        { ...fakeCustomer, page: { ...fakeCustomer.page!, leadgen_tos_accepted: false } },
      ],
      errors: [],
      issues: [],
    }),
  };
  const result = await resolveLaunch(base, ohneTos);
  expect(result).toHaveProperty("error");
  // Der Link ist der eigentliche Inhalt der Meldung: annehmen kann diese
  // Bedingungen nur ein Mensch in Metas Oberfläche, nicht diese Anwendung.
  expect((result as { error: string }).error).toContain(
    "https://www.facebook.com/ads/leadgen/tos?page_id=p1",
  );
});

test("eine Seite mit unlesbarem Bedingungs-Status wird nicht blockiert", async () => {
  // leadgen_tos_accepted fehlt, wenn die Seite dem System User nicht zugewiesen
  // ist – Graph lässt das Feld dann einfach weg. Das ist nicht dasselbe wie
  // "nicht angenommen": im echten Bestand betrifft es rund fünfzig Seiten,
  // deren Bedingungen längst stehen, und die dürfen weiter Kampagnen bekommen.
  expect(fakeCustomer.page?.leadgen_tos_accepted).toBeUndefined();
  expect(await resolveLaunch(base, deps)).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
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
  expect(await resolveLaunch(atMax, deps)).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
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

test("eine Adresse, zu der Meta nichts findet, hält vor dem Anlegen auf", async () => {
  // Der teure stille Fall: Meta legt die Anzeigengruppe an, geocodiert die
  // Adresse aber nie und liefert an niemanden aus. Im Ads Manager sieht sie
  // dabei normal aus – auffallen würde es erst nach einem Tag ohne Leads.
  const result = await resolveLaunch(
    { ...base, adSets: [{ ...base.adSets[0], addressString: "Hauptsraße 1a, Drezden" }] },
    { ...deps, estimateReach: async () => ({ ready: false as const }) },
  );
  expect(result).toHaveProperty("error");
  expect((result as { error: string }).error).toContain("Drezden");
});

test("derselbe Standort wird einmal gefragt, nicht je Anzeigengruppe", async () => {
  let calls = 0;
  const zwei: WizardSubmission = {
    ...base,
    adSets: [
      base.adSets[0],
      { ...base.adSets[0], name: "Ads 2" },
      { ...base.adSets[0], name: "Ads 3", addressString: "Anderswo 2, Leipzig" },
    ],
  };
  await resolveLaunch(zwei, {
    ...deps,
    estimateReach: async () => {
      calls++;
      return { ready: true as const, lower: 100_000, upper: 200_000 };
    },
  });
  expect(calls).toBe(2);
});

test("scheitert die Prüfung selbst, hält sie nichts auf", async () => {
  // Dass wir gerade nicht nachsehen können, ist kein Befund über die Adresse –
  // ein Timeout gegen Meta darf keinen Start blockieren.
  expect(
    await resolveLaunch(base, {
      ...deps,
      estimateReach: async () => {
        throw new Error("(#80004) rate limit");
      },
    }),
  ).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
});

/**
 * Der Fall, der eine fertige Kampagne kurz vor dem Ziel zerlegt hat: Kampagne
 * und alle Anzeigengruppen standen bei Meta, jede Anzeige fiel durch, und der
 * Knopf „Erneut versuchen“ half nicht – an einer Werbepräferenz ändert ein
 * zweiter Versuch nichts.
 */
const lpa = () => {
  throw new GraphError({
    kind: "permission",
    code: LESS_PERSONALIZED_ADS,
    message:
      "Weil hospizsalzgitter sich für less-personalized Werbung entschieden hat, kannst du keine Anzeigen erstellen.",
    retryable: false,
  });
};

test("weniger personalisierte Werbung hält vor dem ersten Schreibzugriff auf", async () => {
  const result = await resolveLaunch(base, {
    ...deps,
    graph: (async (path: string) => pbiaAnswer(path) ?? lpa()) as any,
  });
  expect(result).toHaveProperty("error");
  const { error } = result as { error: string };
  // Metas eigener Wortlaut muss durchkommen: nur er nennt das Konto, das die
  // Wahl getroffen hat – die Anwendung kann es nicht auslesen.
  expect(error).toContain("hospizsalzgitter");
  expect(error).toContain("Werbepräferenzen");
  expect(error).toContain("https://www.facebook.com/business/help/1563729837497242");
});

test("die Identität wird mit validate_only gefragt – es entsteht nichts", async () => {
  const calls: { path: string; params: any }[] = [];
  await resolveLaunch(
    { ...base, adSets: [{ ...base.adSets[0], instagramUserId: "ig1" }] },
    {
      ...deps,
      graph: (async (path: string, opts: any) => {
        calls.push({ path, params: opts.params });
        return { success: true };
      }) as any,
    },
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe("act_1/adcreatives");
  // Ohne diese Zeile legte die Prüfung bei jedem Start eine Gestaltung an.
  expect(calls[0].params.execution_options).toEqual(["validate_only"]);
  // Nur die Identität: ein Medium oder ein Formular in der Probe könnte selbst
  // durchfallen, und der Befund wäre dann keiner über Seite und Instagram-Konto.
  expect(calls[0].params.object_story_spec).toMatchObject({
    page_id: "p1",
    instagram_user_id: "ig1",
  });
});

test("eine fehlende Zuweisung wird als solche erklärt, nicht als Werbepräferenz", async () => {
  const result = await resolveLaunch(base, {
    ...deps,
    graph: (async (path: string) => {
      const pbia = pbiaAnswer(path);
      if (pbia) return pbia;
      throw new GraphError({
        kind: "permission",
        code: 200,
        message: "Du bist nicht berechtigt, auf dieses Profil zuzugreifen.",
        retryable: false,
      });
    }) as any,
  });
  expect((result as { error: string }).error).toContain("Business Manager");
  expect((result as { error: string }).error).not.toContain("Werbepräferenzen");
});

test("jede Gestaltung wird mit validate_only durchgespielt – ein endgültiges Nein hält auf", async () => {
  // Der Fall aus der Praxis: die Identitätsprobe (nur Seite + Instagram) ging
  // durch, aber die echte Gestaltung fiel durch („Wähle ein Instagram-Konto
  // oder eine Facebook-Seite aus …“) – nachdem Kampagne und Anzeigengruppen
  // schon standen. Die Probe muss deshalb die echten Creatives spielen.
  let sent: any[] = [];
  const zwei: WizardSubmission = {
    ...base,
    adSets: [base.adSets[0], { ...base.adSets[0], name: "Ads 2", ads: [splitAd] }],
  };
  const result = await resolveLaunch(zwei, {
    ...deps,
    batch: (async (reqs: any[]) => {
      sent = reqs;
      return reqs.map((_, i) =>
        i === 1
          ? {
              status: "rejected" as const,
              reason: new GraphError({
                kind: "unknown",
                message: "Wähle ein Instagram-Konto oder eine Facebook-Seite aus.",
                retryable: false,
              }),
            }
          : { status: "fulfilled" as const, value: { success: true } },
      );
    }) as any,
  });
  // Eine Anfrage je Anzeige, jede als validate_only – es entsteht nichts.
  expect(sent).toHaveLength(2);
  for (const r of sent) expect(r.body.execution_options).toEqual(["validate_only"]);
  const { error } = result as { error: string };
  expect(error).toContain("„s.jpg“");
  expect(error).toContain("„Ads 2“");
  expect(error).toContain("Wähle ein Instagram-Konto");
});

test("scheitert die Creative-Probe selbst oder nur vorübergehend, hält sie nichts auf", async () => {
  // Ein Rate-Limit oder ein Aussetzer ist ein Befund über den Moment.
  expect(
    await resolveLaunch(base, {
      ...deps,
      batch: (async (reqs: any[]) =>
        reqs.map(() => ({
          status: "rejected" as const,
          reason: new GraphError({ kind: "rate", message: "später", retryable: true }),
        }))) as any,
    }),
  ).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
  expect(
    await resolveLaunch(base, {
      ...deps,
      batch: (async () => {
        throw new Error("network down");
      }) as any,
    }),
  ).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
});

test("scheitert die Identitätsprüfung selbst, hält sie nichts auf", async () => {
  // Dieselbe Regel wie bei der Standortprüfung: ein Rate-Limit ist kein Befund
  // über die Identität. Nur „permission“ blockt – alles andere geht durch.
  for (const kind of ["rate", "unknown", "token"] as const)
    expect(
      await resolveLaunch(base, {
        ...deps,
        graph: (async (path: string) => {
          const pbia = pbiaAnswer(path);
          if (pbia) return pbia;
          throw new GraphError({ kind, message: "gerade nicht", retryable: kind === "rate" });
        }) as any,
      }),
    ).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
});

test("ohne Instagram-Konto probt und startet die Kampagne mit der PBIA der Seite", async () => {
  // Die Wurzel des „Wähle ein Instagram-Konto …“-Fehlers (1772103): ohne
  // instagram_user_id am Creative lehnt Meta jede Anzeige mit Instagram-
  // Platzierungen ab, und use_page_actor_override wird beim Anlegen der
  // Anzeige nicht gewertet. Die Identitätsprobe muss deshalb mit derselben
  // PBIA fragen, die der Aufrufer später in die Anzeigengruppen einträgt.
  const calls: { path: string; params: any }[] = [];
  const result = await resolveLaunch(base, {
    ...deps,
    graph: (async (path: string, opts: any) => {
      calls.push({ path, params: opts?.params });
      return pbiaAnswer(path) ?? { success: true };
    }) as any,
  });
  expect(result).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia1" });
  const probe = calls.find((c) => c.path === "act_1/adcreatives");
  expect(probe?.params.object_story_spec).toMatchObject({
    page_id: "p1",
    instagram_user_id: "pbia1",
  });
});

test("hat die Seite noch keine PBIA, wird sie angelegt", async () => {
  const methods: string[] = [];
  const result = await resolveLaunch(base, {
    ...deps,
    graph: (async (path: string, opts: any) => {
      if (path.endsWith("page_backed_instagram_accounts")) {
        methods.push(opts?.method ?? "GET");
        return opts?.method === "POST" ? { id: "pbia2" } : { data: [] };
      }
      return { success: true };
    }) as any,
  });
  expect(methods).toEqual(["GET", "POST"]);
  expect(result).toEqual({ adAccount: "act_1", pageId: "p1", instagramUserId: "pbia2" });
});

test("ist die PBIA nicht zu bekommen, hält das auf – jede Anzeige fiele sonst durch", async () => {
  // Anders als bei den Proben ist das hier kein Befund über den Moment: die Id
  // steht später in jeder Anzeige, ohne sie kommt exakt der Fehler zurück, den
  // dieser Weg behebt – nachdem Kampagne und Anzeigengruppen schon stünden.
  const result = await resolveLaunch(base, {
    ...deps,
    graph: (async (path: string) => {
      if (path.endsWith("page_backed_instagram_accounts"))
        throw new GraphError({ kind: "rate", message: "gerade nicht", retryable: true });
      return { success: true };
    }) as any,
  });
  expect(result).toHaveProperty("error");
  expect((result as { error: string }).error).toContain("Instagram");
});
