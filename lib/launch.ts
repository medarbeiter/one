/**
 * Anlegen einer Kampagne nach dem Standardablauf der Agentur.
 *
 * Zwei Creative-Formen, beide aus laufenden Kampagnen abgelesen und mit
 * execution_options=['validate_only'] gegen die Graph API geprüft:
 *
 * - **UGC** (ein Video): asset_feed_spec trägt nur Text, object_story_spec Video
 *   und Formular. optimization_type DEGREES_OF_FREEDOM.
 * - **Split** (9:16 + 1:1): alles liegt in asset_feed_spec, das Formular
 *   eingeschlossen; object_story_spec trägt nur noch Seite und Instagram-Konto.
 *   optimization_type PLACEMENT, zwei asset_customization_rules.
 *
 * Der UGC-Pfad ist praktisch das gesamte Volumen und bleibt unverändert – die
 * Verzweigung kostet ein paar Zeilen und schützt den Normalfall davor, für den
 * selteneren umgebaut zu werden (siehe docs/adr/0001).
 */
import { PORTRAIT_PLACEMENTS, SQUARE_PLACEMENTS } from "./targeting";

export type FormatAsset =
  | { kind: "video"; videoId: string; thumbnailUrl?: string; fileName: string }
  | { kind: "image"; hash: string; fileName: string };

/** UGC ist per Definition ein Video – ein Foto dreht niemand von sich selbst. */
export type AdInput =
  | { name: string; type: "ugc"; asset: Extract<FormatAsset, { kind: "video" }> }
  | { name: string; type: "split"; portrait: FormatAsset; square: FormatAsset };

export type CreativeInput = {
  pageId: string;
  instagramUserId?: string;
  formId: string;
  bodies: string[];
  titles: string[];
  description: string;
  callToAction?: string;
  ad: AdInput;
};

/**
 * standard_enhancements ist abgekündigt: Meta lehnt das Feld inzwischen ab
 * ("Das Feld „Standardoptimierungen“ … ist veraltet. Bitte richte stattdessen
 * einzelne Features ein."), und zwar jede Anzeigengestaltung, die es mitschickt.
 * Die Einzelfeatures sind die Übersetzung derselben Absicht: Meta soll nichts
 * an den Creatives verändern.
 */
const CREATIVE_FEATURES = {
  creative_features_spec: {
    advantage_plus_creative: { enroll_status: "OPT_OUT" },
    image_enhancement: { enroll_status: "OPT_OUT" },
    image_templates: { enroll_status: "OPT_OUT" },
    image_touchups: { enroll_status: "OPT_OUT" },
    inline_comment: { enroll_status: "OPT_OUT" },
    text_optimizations: { enroll_status: "OPT_OUT" },
  },
} as const;

const assetKey = (a: FormatAsset) => (a.kind === "video" ? a.videoId : a.hash);

const mediaEntry = (a: FormatAsset, label: string) =>
  a.kind === "video"
    ? { video_id: a.videoId, adlabels: [{ name: label }] }
    : { hash: a.hash, adlabels: [{ name: label }] };

const mediaLabel = (a: FormatAsset, label: string) =>
  a.kind === "video" ? { video_label: { name: label } } : { image_label: { name: label } };

function adFormats(portrait: FormatAsset, square: FormatAsset): string[] {
  if (portrait.kind === square.kind)
    return portrait.kind === "video" ? ["SINGLE_VIDEO"] : ["SINGLE_IMAGE"];
  // Gemischte Paare sind der ausdrücklich erlaubte Ausnahmefall; in den
  // laufenden Kampagnen stehen die drei Beispiele dafür genau so da.
  return ["AUTOMATIC_FORMAT"];
}

export function buildCreative(i: CreativeInput) {
  if (!i.bodies.length || !i.titles.length)
    throw new Error("Mindestens ein Primärtext und eine Überschrift sind erforderlich.");
  if (i.bodies.length > 5 || i.titles.length > 5)
    throw new Error("Meta erlaubt höchstens 5 Primärtexte und 5 Überschriften.");
  if (!i.formId) throw new Error("Ein Lead-Formular muss ausgewählt sein.");

  return i.ad.type === "ugc" ? ugcCreative(i, i.ad) : splitCreative(i, i.ad);
}

function ugcCreative(i: CreativeInput, ad: Extract<AdInput, { type: "ugc" }>) {
  // DEGREES_OF_FREEDOM verlangt, dass mindestens ein Feld mehr als einen Eintrag
  // trägt; mit je einem Text lehnt Meta ab ("Anzeigen mit Gestaltungsfreiraum
  // benötigen mindestens ein Gestaltungsfreiraum-Feld mit mehr als einem Asset").
  // Die Meldung hier zu werfen ist der Unterschied zwischen einem verständlichen
  // Hinweis im Assistenten und dem Satz oben mitten im Anlegen.
  if (i.bodies.length < 2 && i.titles.length < 2)
    throw new Error(
      "Eine UGC-Anzeige braucht mindestens zwei Primärtexte oder zwei Überschriften — Meta lehnt je einen ab.",
    );

  return {
    object_story_spec: {
      page_id: i.pageId,
      ...(i.instagramUserId ? { instagram_user_id: i.instagramUserId } : {}),
      video_data: {
        video_id: ad.asset.videoId,
        image_url: ad.asset.thumbnailUrl,
        call_to_action: {
          type: i.callToAction ?? "APPLY_NOW",
          // link ist bei Lead-Ads ein Platzhalter – Meta verlangt ihn trotzdem.
          value: { lead_gen_form_id: i.formId, link: "http://fb.me/" },
        },
      },
    },
    asset_feed_spec: {
      bodies: i.bodies.map((text) => ({ text })),
      titles: i.titles.map((text) => ({ text })),
      descriptions: [{ text: i.description }],
      // Ohne diese Zeile liest Meta den Feed als Format-Variation und lehnt ab:
      // "Ein Asset Feed kann nur ein bestimmtes Format haben." Das Format steht
      // schon in object_story_spec (ein Video); variieren darf nur der Text.
      optimization_type: "DEGREES_OF_FREEDOM",
    },
    degrees_of_freedom_spec: CREATIVE_FEATURES,
  };
}

function splitCreative(i: CreativeInput, ad: Extract<AdInput, { type: "split" }>) {
  const p = assetKey(ad.portrait);
  const s = assetKey(ad.square);
  // Aus den Asset-IDs abgeleitet: eindeutig je Inhalt, stabil über Läufe hinweg
  // und damit testbar – anders als die Zufallsnamen, die der Ads Manager vergibt.
  const L = {
    p: `mo_asset_p_${p}`,
    s: `mo_asset_s_${s}`,
    bp: `mo_body_p_${p}`,
    bs: `mo_body_s_${s}`,
    tp: `mo_title_p_${p}`,
    ts: `mo_title_s_${s}`,
    up: `mo_url_p_${p}`,
    us: `mo_url_s_${s}`,
  };
  const cta = i.callToAction ?? "APPLY_NOW";
  const media = [
    { asset: ad.portrait, label: L.p },
    { asset: ad.square, label: L.s },
  ];
  const videos = media.filter((m) => m.asset.kind === "video");
  const images = media.filter((m) => m.asset.kind === "image");

  return {
    // Kein Medium hier: bei PLACEMENT liegt alles im Asset Feed, und
    // object_story_spec trägt nur noch die Identität.
    object_story_spec: {
      page_id: i.pageId,
      ...(i.instagramUserId ? { instagram_user_id: i.instagramUserId } : {}),
    },
    asset_feed_spec: {
      ...(videos.length
        ? { videos: videos.map((m) => mediaEntry(m.asset, m.label)) }
        : {}),
      ...(images.length
        ? { images: images.map((m) => mediaEntry(m.asset, m.label)) }
        : {}),
      // Beide Regeln bekommen dieselben Texte – variieren soll nur das Medium.
      // Deshalb trägt jeder Text die Labels *beider* Regeln.
      bodies: i.bodies.map((text) => ({
        text,
        adlabels: [{ name: L.bp }, { name: L.bs }],
      })),
      titles: i.titles.map((text) => ({
        text,
        adlabels: [{ name: L.tp }, { name: L.ts }],
      })),
      // Ohne Label und damit für beide Regeln gültig.
      descriptions: [{ text: i.description }],
      call_to_action_types: [cta],
      call_to_actions: [{ type: cta, value: { lead_gen_form_id: i.formId } }],
      link_urls: [
        {
          website_url: "http://fb.me/",
          display_url: "",
          adlabels: [{ name: L.up }, { name: L.us }],
        },
      ],
      ad_formats: adFormats(ad.portrait, ad.square),
      optimization_type: "PLACEMENT",
      // Reihenfolge ist bedeutungslos – gebunden wird über die Labels, nicht über
      // die Position. In den laufenden Kampagnen steht mal die eine, mal die
      // andere Regel vorn; priority sagt, was gilt.
      asset_customization_rules: [
        {
          priority: 1,
          customization_spec: PORTRAIT_PLACEMENTS,
          ...mediaLabel(ad.portrait, L.p),
          body_label: { name: L.bp },
          title_label: { name: L.tp },
          link_url_label: { name: L.up },
        },
        {
          priority: 2,
          customization_spec: SQUARE_PLACEMENTS,
          ...mediaLabel(ad.square, L.s),
          body_label: { name: L.bs },
          title_label: { name: L.ts },
          link_url_label: { name: L.us },
        },
      ],
    },
    degrees_of_freedom_spec: CREATIVE_FEATURES,
  };
}

import { batch as realBatch, graph as realGraph, unwrapBatchItem, GraphError } from "./graph";
import { buildTargeting } from "./targeting";

export type AdSetInput = {
  name: string;
  addressString: string;
  radiusKm: number;
  formId: string;
  instagramUserId?: string;
  bodies: string[];
  titles: string[];
  description: string;
  ads: AdInput[];
  dailyBudgetCents?: number;
  /** Vorhandenes Ad Set weiterbauen statt neu anlegen (Retry) – sonst entstünde
   * neben dem Original ein zweites Ad Set mit demselben Namen. */
  existingAdSetId?: string;
};

export type LaunchInput = {
  adAccount: string;
  pageId: string;
  campaignName: string;
  dailyBudgetCents: number;
  spendCapCents?: number;
  adSets: AdSetInput[];
  /** Vorhandene Kampagne weiterbauen statt neu anlegen (Retry). */
  existingCampaignId?: string;
};

export type Receipt = {
  campaignId?: string;
  /** index ist die Position in submission.adSets, mit der dieser Eintrag
   * entstand – explizit mitgeführt, weil das Retry-UI (receipt.tsx) einen
   * Fehleintrag verlässlich seinem Ad Set zuordnen muss, ohne sich auf
   * Array-Position oder auf Namen zu verlassen (beide sind vom Bediener frei
   * änderbar und nicht eindeutig). */
  adSets: { index: number; id?: string; name: string; adIds: string[]; error?: string }[];
  /** Nach Anzeige geschlüsselt, nicht nach Datei: eine Split-Anzeige hat zwei
   * Dateien, hochgeladen sind zu diesem Zeitpunkt beide, und gescheitert ist die
   * Anzeige. Der Retry baut ohnehin je Anzeige nach.
   *
   * adSetIndex ist Pflicht, nicht Beiwerk: Ad-Set-Anlage-Fehler und
   * Anzeigen-Fehler entstehen in getrennten Phasen (erst alle Ad Sets, dann
   * – seit dem Pool nebenläufig – alle Anzeigen), sodass die Reihenfolge
   * dieser Liste weder der Eingabereihenfolge noch der Ad-Set-Reihenfolge
   * folgt. Ohne den Index lässt sich ein Fehler seinem Ad Set nicht mehr
   * verlässlich zuordnen. */
  failed: { adSetIndex: number; adSetName: string; adName: string; error: string }[];
};

/**
 * Ein Schritt, wie ihn die Oberfläche zeigt. Eine Kampagne mit drei
 * Anzeigengruppen à fünf Anzeigen sind über dreißig Aufrufe nacheinander, jeder
 * gegen Metas Server – ohne diese Meldungen steht dort eine Minute lang nur
 * "Creating…" und niemand kann ein Hängen von normalem Arbeiten unterscheiden.
 */
export type LaunchProgress = { label: string; done: number; total: number };

export type LaunchDeps = {
  graph?: typeof realGraph;
  batch?: typeof realBatch;
  onProgress?: (p: LaunchProgress) => void;
};

/** Jeder Aufruf, den launch() gegen Meta macht – die Nenner der Fortschrittsanzeige. */
export function launchSteps(input: LaunchInput): number {
  return (
    (input.existingCampaignId ? 0 : 1) +
    input.adSets.reduce((n, s) => n + (s.existingAdSetId ? 0 : 1) + s.ads.length, 0)
  );
}

/** Eine Anzeige mit allem, was zu ihrem Anlegen gehört: die Gruppe, aus der ihre
 * Texte und ihr Formular kommen, und die Quittungszeile, in die ihre Id gehört.
 * adSetIndex reist mit, damit ein Fehlschlag (fail()) seinem Ad Set nicht per
 * Namen oder Position, sondern explizit zugeordnet werden kann. */
type AdJob = {
  set: AdSetInput;
  entry: Receipt["adSets"][number];
  ad: AdInput;
  adSetIndex: number;
};

type Ctx = {
  graph: typeof realGraph;
  batch: typeof realBatch;
  acct: string;
  pageId: string;
  receipt: Receipt;
  step: (label: string) => void;
  stepDone: () => void;
};

/** Einmal gebaut, von beiden Wegen benutzt: einzeln und im Batch geht dieselbe
 * Nutzlast an Meta, sonst wäre der schnelle Weg nicht derselbe Weg. */
function creativeParams(ctx: Ctx, { set, ad }: AdJob): Record<string, unknown> {
  return {
    // Nur der Name der Anzeige. Der Kampagnenname steht schon auf der Kampagne;
    // in der Anzeigenliste wiederholt er sich sonst in jeder Zeile und schiebt
    // genau das aus dem Bild, was man dort sucht.
    name: ad.name,
    ...buildCreative({
      pageId: ctx.pageId,
      instagramUserId: set.instagramUserId,
      formId: set.formId,
      bodies: set.bodies,
      titles: set.titles,
      description: set.description,
      ad,
    }),
  };
}

const adParams = (job: AdJob) => ({
  name: job.ad.name,
  adset_id: job.entry.id,
  status: "ACTIVE",
});

const fail = (ctx: Ctx, job: AdJob, error: string) =>
  ctx.receipt.failed.push({
    adSetIndex: job.adSetIndex,
    adSetName: job.set.name,
    adName: job.ad.name,
    error,
  });

/** Creative und Anzeige einzeln, zwei Aufrufe nacheinander. */
async function createAd(ctx: Ctx, job: AdJob): Promise<void> {
  try {
    ctx.step(`Anzeige „${job.ad.name}“ in „${job.set.name}“ wird erstellt`);
    const creative = await ctx.graph<{ id: string }>(`${ctx.acct}/adcreatives`, {
      method: "POST",
      params: creativeParams(ctx, job),
    });
    const created = await ctx.graph<{ id: string }>(`${ctx.acct}/ads`, {
      method: "POST",
      params: { ...adParams(job), creative: { creative_id: creative.id } },
    });
    job.entry.adIds.push(created.id);
  } catch (e) {
    fail(ctx, job, (e as Error).message);
  } finally {
    // Auch eine gescheiterte Anzeige ist abgearbeitet – der Fehler steht in der
    // Receipt, die Anzeige darf deswegen nicht stehen bleiben.
    ctx.stepDone();
  }
}

/**
 * Drei Anzeigen gleichzeitig. Nicht mehr, weil derselbe Weg auch der Rückfall
 * für einen gescheiterten Batch ist – und der scheitert im Zweifel an einem
 * Rate-Limit, in das hineinzurennen die Sache nicht besser macht.
 */
const POOL = 3;

/** Bis zu POOL Anzeigen gleichzeitig, über alle Ad Sets hinweg – ein
 * gemeinsamer Zähler statt fester Blöcke, damit ein früh fertiger Worker
 * sofort den nächsten Job übernimmt, statt auf seinen eigenen Block zu warten. */
async function poolAds(ctx: Ctx, jobs: AdJob[]): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(POOL, jobs.length) }, async () => {
      while (next < jobs.length) await createAd(ctx, jobs[next++]);
    }),
  );
}

/**
 * Ab hier lohnt das Bündeln. Darunter spart es gegenüber dem Pool ein bis zwei
 * Sekunden und kostet dafür die Meldung je Anzeige – bei einer Kampagne, die
 * klein genug ist, um ihr zuzusehen, ist das der schlechtere Tausch.
 */
const BATCH_THRESHOLD = 9;

/**
 * Fünf Anzeigen sind zehn Sub-Requests, Graph nimmt fünfzig. Zehn Anzeigen je
 * Aufruf wären noch einmal halb so viele Aufrufe und ungefähr eine Sekunde; fünf
 * halten dafür die Fortschrittsanzeige in Bewegung und die Nutzlast einer
 * Split-Anzeige klein.
 *
 * Sicherheitsbedingung, die diese Zahl nicht verlassen darf: CHUNK * 2 muss
 * <= 50 bleiben. batch() in lib/graph.ts schickt Sub-Requests in Blöcken von
 * 50 nacheinander los; träfe ein GraphError erst den zweiten Block, wären die
 * 50 Sub-Requests des ersten Blocks längst gelaufen, und der Rückfall auf
 * poolAds in batchAds legte sie ein zweites Mal an – genau die Dopplung, die
 * dieser Task verhindern soll. Vor jeder Erhöhung von CHUNK diese Grenze prüfen.
 */
const CHUNK = 5;

async function batchAds(ctx: Ctx, jobs: AdJob[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK);
    ctx.step(`Anzeigen ${i + 1}–${i + chunk.length} von ${jobs.length} werden erstellt`);

    // Außerhalb des try: Baut eine Anzeige gar nicht erst (z. B. eine UGC-Anzeige
    // mit nur einem Text), ist das ein Programmfehler und keine unklare
    // Netzwerklage – Meta wurde noch gar nicht gefragt. Läge das im try, würde
    // GraphError-Prüfung diesen Fall nie treffen und der Fehler liefe in den
    // "abgerissen"-Zweig, der Anzeigen fälschlich als "möglicherweise trotzdem
    // erstellt" meldet, obwohl beweisbar keine einzige losging.
    const reqs = chunk.flatMap((job, k) => [
      {
        method: "POST" as const,
        relative_url: `${ctx.acct}/adcreatives`,
        name: `cr_${i + k}`,
        body: creativeParams(ctx, job),
      },
      {
        method: "POST" as const,
        relative_url: `${ctx.acct}/ads`,
        depends_on: `cr_${i + k}`,
        body: { ...adParams(job), creative: { creative_id: `{result=cr_${i + k}:$.id}` } },
      },
    ]);

    let items: PromiseSettledResult<{ id: string }>[];
    try {
      items = await ctx.batch<{ id: string }>(reqs);
    } catch (e) {
      if (e instanceof GraphError) {
        // Meta hat geantwortet, also mit einem Fehler-Body: ein Batch, der
        // gelaufen ist, kommt mit 200 und Einzelcodes zurück. Kein Sub-Request
        // ist also entstanden, und dieselben Anzeigen dürfen einzeln los.
        await poolAds(ctx, chunk);
        continue;
      }
      // Ohne Antwort von Meta ist das Gegenteil nicht gesagt: die zehn
      // Sub-Requests können längst gelaufen sein. Ein zweiter Versuch legt sie
      // dann ein zweites Mal an, und das sieht in der Anzeigengruppe niemand als
      // Fehler – deshalb hier stehen lassen und benennen. Route über fail(), damit
      // adSetIndex korrekt mitgeführt wird, auch wenn der Chunk Anzeigen aus
      // mehreren Anzeigengruppen enthält.
      // Nicht jeder Wurf ist ein Error (z. B. ein geworfener String) – ohne
      // diesen Fallback stünde hier "undefined" statt der eigentlichen Ursache.
      // Das sichere Verhalten (nicht nachholen, benennen) bleibt unverändert.
      const cause = e instanceof Error ? e.message : String(e);
      for (const job of chunk) {
        fail(
          ctx,
          job,
          `${cause} — diese Anzeigen wurden möglicherweise trotzdem erstellt. Prüfe die Anzeigengruppe, bevor du sie erneut anlegst.`,
        );
        ctx.stepDone();
      }
      continue;
    }

    chunk.forEach((job, k) => {
      // Fehlt ein Eintrag ganz, ist das derselbe Fall wie ein leerer: keine
      // Antwort zu dieser Anzeige.
      const creative = items[k * 2] ?? unwrapBatchItem<{ id: string }>(null);
      const ad = items[k * 2 + 1] ?? unwrapBatchItem<{ id: string }>(null);
      // Reihenfolge ist die Aussage: scheitert das Creative, ist die Anzeige
      // dahinter nur die Folge davon und kein zweiter Fehler.
      if (creative.status === "rejected") fail(ctx, job, (creative.reason as Error).message);
      else if (ad.status === "rejected") fail(ctx, job, (ad.reason as Error).message);
      else job.entry.adIds.push(ad.value.id);
      ctx.stepDone();
    });
  }
}

export async function launch(
  input: LaunchInput,
  deps: LaunchDeps = {},
): Promise<Receipt> {
  const graph = deps.graph ?? realGraph;
  const batchFn = deps.batch ?? realBatch;
  const acct = input.adAccount;
  const receipt: Receipt = { adSets: [], failed: [] };

  const total = launchSteps(input);
  let done = 0;
  // Vor dem Aufruf melden, nicht danach: die Meldung soll benennen, worauf
  // gerade gewartet wird.
  const step = (label: string) => deps.onProgress?.({ label, done, total });
  const stepDone = () => {
    done++;
  };
  const ctx: Ctx = { graph, batch: batchFn, acct, pageId: input.pageId, receipt, step, stepDone };

  // Kampagne pausiert, alles darunter aktiv: so startet Metas Prüfung sofort,
  // ohne dass Budget fließt. Genau die Reihenfolge des manuellen Ablaufs.
  if (input.existingCampaignId) {
    receipt.campaignId = input.existingCampaignId;
  } else {
    step(`Kampagne „${input.campaignName}“ wird erstellt`);
    const campaign = await graph<{ id: string }>(`${acct}/campaigns`, {
      method: "POST",
      params: {
        name: input.campaignName,
        objective: "OUTCOME_LEADS",
        status: "PAUSED",
        special_ad_categories: ["EMPLOYMENT"],
        special_ad_category_country: ["DE"],
        daily_budget: input.dailyBudgetCents,
        // Das Budget liegt auf der Kampagne, also gilt ihre Gebotsstrategie für
        // jedes Ad Set darunter – die des Ad Sets ist dann nur Beiwerk. Ohne
        // dieses Feld wählt Meta selbst und nahm zuletzt LOWEST_COST_WITH_BID_CAP;
        // eine Cap-Strategie lehnt jedes Ad Set ohne bid_amount ab ("Gebotswert
        // erforderlich"). Genau das zeigt der Assistent auch an.
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        ...(input.spendCapCents ? { spend_cap: input.spendCapCents } : {}),
      },
    });
    receipt.campaignId = campaign.id;
    stepDone();
  }

  const jobs: AdJob[] = [];

  for (const [adSetIndex, set] of input.adSets.entries()) {
    const entry: Receipt["adSets"][number] = { index: adSetIndex, name: set.name, adIds: [] };
    receipt.adSets.push(entry);

    if (set.existingAdSetId) {
      // Retry: das Ad Set gibt es schon, nur ein Teil seiner Anzeigen fehlt.
      entry.id = set.existingAdSetId;
    } else {
      try {
        step(`Anzeigengruppe „${set.name}“ wird erstellt`);
        const adset = await graph<{ id: string }>(`${acct}/adsets`, {
          method: "POST",
          params: {
            name: set.name,
            campaign_id: receipt.campaignId,
            status: "ACTIVE",
            destination_type: "ON_AD",
            promoted_object: { page_id: input.pageId },
            optimization_goal: "LEAD_GENERATION",
            billing_event: "IMPRESSIONS",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            targeting: buildTargeting({
              addressString: set.addressString,
              radiusKm: set.radiusKm,
            }),
            ...(set.dailyBudgetCents ? { daily_budget: set.dailyBudgetCents } : {}),
          },
        });
        entry.id = adset.id;
        stepDone();
      } catch (e) {
        entry.error = (e as Error).message;
        // Ohne das hätte der Bediener keinen Weg, das komplette Ad Set über den
        // Retry nachzuholen – genau der Reparaturfall, für den die Receipt
        // existiert. Jede Anzeige zählt als "fehlgeschlagen", obwohl keine
        // einzeln versucht wurde.
        for (const ad of set.ads) {
          receipt.failed.push({
            adSetIndex,
            adSetName: set.name,
            adName: ad.name,
            error: entry.error,
          });
        }
        // Übersprungen, nicht offen: sonst bliebe die Anzeige bei 6 von 10
        // stehen, während längst die nächste Gruppe läuft.
        done += set.ads.length;
        continue;
      }
    }

    for (const ad of set.ads) jobs.push({ set, entry, ad, adSetIndex });
  }

  if (jobs.length >= BATCH_THRESHOLD) await batchAds(ctx, jobs);
  else await poolAds(ctx, jobs);

  return receipt;
}
