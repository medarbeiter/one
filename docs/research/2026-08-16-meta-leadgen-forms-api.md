# Meta Lead Ads Forms via Marketing API — Research Notes

Date: 2026-08-16
Context: /campaigns/new wizard must create leadgen forms programmatically for ~200 care-service clients, each with their own Facebook Page.
Doc versions observed: Graph API reference pages render **v26.0**; Marketing API lead-ads guides show examples pinned to **v25.0**.

Primary sources only (developers.facebook.com and Meta Business Help Center). Every claim carries its source URL.

---

## 1. Creating a form: `POST /{page-id}/leadgen_forms`

Confirmed. Forms are created with a POST to the Page's `leadgen_forms` edge; the response is `{"id": "<leadgen_form_id>"}`.

- Guide: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create
- Edge reference: https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/

### Required parameters
(Source for all parameter details in this section: the edge reference above, v26.0.)

| Param | Type | Notes |
|---|---|---|
| `name` | string | "The name that will help identity the form" |
| `questions` | list<Object> | Ordered via each question's `key` |

Question object sub-fields: `key`, `label`, `type` (required), `inline_context`, `options`, `dependent_conditional_questions`, `conditional_questions_group_id`.

Question `type` enum includes prefill types (`FULL_NAME`, `FIRST_NAME`, `LAST_NAME`, `EMAIL`, `WORK_EMAIL`, `PHONE`, ...), `CUSTOM` (free text, or multiple choice when an `options` array of `{value, key}` pairs is given), `SLIDER`, `DATE_TIME` (appointment request, optional `inline_context`), `STORE_LOOKUP` (needs `context_provider_type: "LOCATION_MANAGER"` + Store Pages), `VIN`, and Latin-America national-ID types (`ID_AR_DNI`, `ID_CPF`, `ID_CL_RUT`, `ID_CO_CC`, `ID_EC_CI`, `ID_PE_DNI` — max one per form, audience must match the country).
(Create guide + edge reference above.)

Conditional questions: modeled on the question object via `dependent_conditional_questions` and `conditional_questions_group_id` (edge reference).

### Optional parameters (edge reference, v26.0)

- `privacy_policy` (Object `{url, link_text}`) — **`link_text` max 70 characters**. A malformed URL or overlong link_text surfaces as an unlisted error.
- `follow_up_action_url` (URI) — "final destination URL that user will go to when clicking view website button".
- `context_card` (Object) — intro page: `title`, `style` (`LIST_STYLE` | `PARAGRAPH_STYLE`), `content`, `button_text`, `cover_photo_id`. Separate `cover_photo` file param exists; sending it requires **`pages_manage_posts`** on the token.
- `thank_you_page` (Object) — `title` (required), `button_type` (required; enum `VIEW_WEBSITE`, `CALL_BUSINESS`, `MESSAGE_BUSINESS`, `DOWNLOAD`, `SCHEDULE_APPOINTMENT`, `VIEW_ON_FACEBOOK`, `PROMO_CODE`, `NONE`, `WHATSAPP`, `P2B_MESSENGER`, `BOOK_ON_WEBSITE`), plus `body`, `short_message`, `button_text`, `button_description`, `business_phone_number`, `website_url`, `country_code`, `enable_messenger` (default false), `gated_file`.
- `locale` (enum, ~32 values e.g. `DE_DE`, `EN_US`) — "Pre-defined questions renders in this locale". Relevant for our German clients: prefill question labels render in the form's locale.
- `block_display_for_non_targeted_viewer` (boolean) — hides the organic post from non-ad viewers (successor of deprecated `allow_organic_lead_retrieval`).
- `question_page_custom_headline` (string) — custom headline on the question page.
- `custom_disclaimer` (Object) — `title`, `body` (`text` required, `url_entities` for inline links), `checkboxes` (`text` required, `key`, `is_required` default true, `is_checked_by_default` default false).
- `is_optimized_for_quality` (boolean, default false) — adds a review-and-confirm step.
- `is_phone_sms_verify_enabled`, `is_lead_capture_ai_agent_enabled`, `should_enforce_work_email`, `is_for_canvas` (booleans).
- `tracking_parameters` (JSON `{string: string}`) — key/value metadata returned with the lead's field data.
- `upload_gated_file` (file) — gated content; thank-you `button_type` must be `VIEW_ON_FACEBOOK`. (Also in create guide.)

### "MORE_VOLUME vs HIGHER_INTENT"
No API parameter with those names exists on this endpoint. The Ads-Manager "Higher intent" form type maps to **`is_optimized_for_quality: true`** ("adds a review step... for higher-intent leads" per the create guide); default (false) is the "More volume" behavior.
- https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create
- https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/

### Minimal working payload

```bash
curl -X POST "https://graph.facebook.com/v26.0/{PAGE_ID}/leadgen_forms" \
  -F 'access_token={PAGE_ACCESS_TOKEN}' \
  -F 'name=Pflegekraft Bewerbung 2026' \
  -F 'locale=DE_DE' \
  -F 'privacy_policy={"url":"https://client.example/datenschutz","link_text":"Datenschutzerklärung"}' \
  -F 'questions=[
        {"type":"FULL_NAME","key":"question1"},
        {"type":"EMAIL","key":"question2"},
        {"type":"PHONE","key":"question3"},
        {"type":"CUSTOM","key":"question4","label":"Welche Qualifikation haben Sie?",
         "options":[{"value":"Examinierte Pflegefachkraft","key":"pfk"},
                    {"value":"Pflegehelfer:in","key":"ph"}]}
      ]' \
  -F 'follow_up_action_url=https://client.example/danke'
```
Response: `{"id":"<FORM_ID>"}` (create guide). Note: `privacy_policy` is listed as optional in the reference, but ship it always — lead ads policy requires advertisers collecting personal info to link a privacy policy, and the Ads-Manager flow enforces it.

Messenger-eligible forms restrict question types to `CUSTOM`, `EMAIL`, `FIRST_NAME`, `FULL_NAME`, `LAST_NAME`, `PHONE` and require `block_display_for_non_targeted_viewer=false` (create guide).

---

## 2. Tokens, permissions, App Review

- Create/manage lead ads requires: **`ads_management`, `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`** plus "a Page access token from a person who can perform the `ADVERTISE` task on the Page".
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create
- Reading lead data additionally requires **`leads_retrieval`**; full set for lead + ad-level data: `ads_management`, `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads` (+ `pages_manage_metadata` when using webhooks).
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
- **App Review is mandatory to retrieve leads**: submission must include `leads_retrieval` and `pages_manage_ads`; approval is followed by **Business Verification**. Apps in Development mode cannot retrieve real leads (only leads submitted by app-role holders).
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/
- Token-type guidance: Meta recommends **Page access tokens** over user tokens because user-token rate limits scale with the app's active users (typically 1 for a lead-ads integration), while Page-token limits scale with the Page's users. Reading leads requires Page Admin access or "flexible permissions" (task-based access without full admin).
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/
- `cover_photo` upload additionally needs `pages_manage_posts`.
  https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/

Implication for us: per client, obtain a long-lived Page token derived from a System User / user token with the scopes above; the same token creates forms and (post-review) retrieves leads.

---

## 3. Page TOS prerequisite (`leadgen_tos_accepted`)

Page node fields (Graph API reference v26.0, https://developers.facebook.com/docs/graph-api/reference/page/):

- `leadgen_tos_accepted` (bool) — "Indicates whether a user has accepted the TOS for running LeadGen Ads on the Page"
- `leadgen_tos_accepting_user` (User) — who accepted
- `leadgen_tos_acceptance_time` (datetime) — when

**None of these appear in the Page update (POST) parameter list — they are read-only.** There is no API to accept the Lead Ads TOS; a Page admin must accept it once in the UI (Ads Manager / Forms Library / leadgen TOS dialog). Check programmatically per client:

```
GET /{PAGE_ID}?fields=leadgen_tos_accepted,leadgen_tos_acceptance_time&access_token={PAGE_TOKEN}
```

These fields carry no public-access qualifier, so a Page-scoped token is needed (and a Page token is required whenever User info like `leadgen_tos_accepting_user` is included).
Source: https://developers.facebook.com/docs/graph-api/reference/page/

(Matches existing memory note: this is the one unavoidable manual click per Page; surface it as a wizard precondition check.)

---

## 4. Reading, updating, archiving forms

- List forms: `GET /{PAGE_ID}/leadgen_forms?fields=name,id` ; read questions: `GET /{FORM_ID}?fields=questions` ; Messenger eligibility: `fields=is_eligible_for_in_thread_forms`.
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create
- **Forms cannot be edited after publishing.** The Business Help Center is explicit: "You can't edit a published instant form, but you can duplicate a published form, make changes to it and then save it as a new form."
  https://www.facebook.com/business/help/1025066254239352
- **Forms cannot be deleted.** The create guide: archive with `POST /{FORM_ID}` `status=ARCHIVED`; "deletion isn't supported"; reactivate with `status=ACTIVE`. Archived forms are hidden from the Forms Library and can't be used in new ads (existing leads remain retrievable).
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create
- The `/{page-id}/leadgen_forms` edge itself documents no UPDATE/DELETE operations.
  https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/

Design consequence: treat forms as immutable, versioned artifacts. "Edit" in the wizard = create a new form + repoint the ad creative; archive the old one.

---

## 5. Attaching a form to an ad (full stack)

Source for all steps: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create (v25.0 examples)

1. **Campaign** — `POST /act_{AD_ACCOUNT_ID}/campaigns` with `objective=OUTCOME_LEADS`, `buying_type=AUCTION`, `special_ad_categories` (for recruiting in the EU: `EMPLOYMENT` applies — flagging; the lead-ads doc itself just shows `["NONE"]`), `status=PAUSED`.
2. **Ad set** — `POST /act_{AD_ACCOUNT_ID}/adsets` with `campaign_id`, `optimization_goal=LEAD_GENERATION` (or `QUALITY_LEAD`), `billing_event=IMPRESSIONS`, `destination_type=ON_AD`, **`promoted_object={"page_id":"<PAGE_ID>"}`**, budget/bid, `status=PAUSED`. (`QUALITY_LEAD` + CRM: may add `pixel_id` inside `promoted_object`, no `pixel_rule` needed.)
3. **Creative** — `POST /act_{AD_ACCOUNT_ID}/adcreatives`; minimal shape:

```json
{
  "object_story_spec": {
    "page_id": "<PAGE_ID>",
    "link_data": {
      "message": "Werde Teil unseres Pflegeteams!",
      "image_hash": "<IMAGE_HASH>",
      "link": "https://fb.me/",
      "call_to_action": {
        "type": "SIGN_UP",
        "value": { "lead_gen_form_id": "<FORM_ID>" }
      }
    }
  }
}
```

   Constraints: `link` may only be `https://fb.me/`; allowed CTA types: `APPLY_NOW`, `DOWNLOAD`, `GET_QUOTE`, `LEARN_MORE`, `SIGN_UP`, `SUBSCRIBE` (`APPLY_NOW` fits recruiting). Carousel: put the same `lead_gen_form_id` in every `child_attachments` entry. Video: `video_data` with `call_to_action.value` containing both `link` and `lead_gen_form_id`.
4. **Ad** — `POST /act_{AD_ACCOUNT_ID}/ads` with `adset_id`, `creative={"creative_id":...}`, `status=PAUSED`; ads go through `PENDING_REVIEW` → `ACTIVE`.

---

## 6. Retrieving leads

Source: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving (v25.0)

- Bulk: `GET /{AD_ID}/leads` or `GET /{FORM_ID}/leads` (form aggregates across all ads using it). Single: `GET /{LEAD_ID}`. Typical fields: `created_time,id,ad_id,form_id,field_data`. Cursor paging; `filtering` on `time_created` with `LESS_THAN` / `GREATER_THAN` / `GREATER_THAN_OR_EQUAL`.
- Custom-disclaimer checkbox answers are NOT in `field_data` — query `?fields=custom_disclaimer_responses` (returns `checkbox_key`, `is_checked`).
- CSV export: `https://www.facebook.com/ads/lead_gen/export_csv/?id=<FORM_ID>&type=form&from_date=<ts>&to_date=<ts>`.
- **`leads_retrieval` permission is required to read leads** (plus the scope sets in §2).
- **Webhooks** (real-time, the right choice for CRM sync): subscribe app's Webhooks product to object `page`, field `leadgen`; then per Page: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with the Page token. Payload: `object:"page"`, `entry[].changes[]` with `field:"leadgen"` and `value:{leadgen_id, page_id, form_id, adgroup_id, ad_id, created_time}`; fetch the lead by `leadgen_id`. Notifications can lag "up to a few minutes". Use a long-lived Page token.
  https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
- **90-day retention**: "Leads data is available for download for 90 days from the time when a form is submitted." Not retrievable afterwards. Treat Meta as a transient buffer; webhook-ingest into our own DB.
  https://en-gb.facebook.com/business/help/1526849577619206 (About expired leads)
  https://www.facebook.com/business/help/794345304231812 (Ads Manager download)
- **Lead-read rate limit**: 200 × 24 × (leads created on the Page in the past 90 days) per 24h window; error code 80005 = too many leadgen calls, back off and retry.
  https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
  https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ (error 80005)

---

## 7. Preview and testing

Source: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/testing-troubleshooting/

- **Test leads via API**: `POST /{FORM_ID}/test_leads` (Page token; requires page role Advertiser+; only ONE test lead per form — delete before creating another). Customize with `field_data=[{"name":...,"values":[...]}]` and `custom_disclaimer_responses=[{"checkbox_key":...,"is_checked":...}]`. Read: `GET /{FORM_ID}/test_leads`. Delete: `DELETE /{LEAD_ID}` ("Only the owner of the lead can delete the lead"). Test leads are organic, not tied to any ad.
- **Lead Ads Testing Tool** (UI): https://developers.facebook.com/tools/lead-ads-testing — pick Page + form, "Create Lead", "Preview Form" to customize submitted values, "Track Status" to verify webhook delivery (success shows the exact payload sent; failed shows `error_code`). Cannot be used while the app is in developer mode.
- Webhooks dashboard has a Test button once Webhooks is configured.
- Development-mode apps: can't retrieve real leads; app-role users' submissions are readable (overview page, §2 source).

---

## 8. Gotchas & limits (summary for the implementer)

| Gotcha | Detail | Source |
|---|---|---|
| Form immutability | Published forms can't be edited — duplicate + repoint ads | https://www.facebook.com/business/help/1025066254239352 |
| No delete | Only `status=ARCHIVED` / back to `ACTIVE` | https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create |
| TOS click | `leadgen_tos_accepted` is read-only; one manual acceptance per Page, check before wizard runs | https://developers.facebook.com/docs/graph-api/reference/page/ |
| App Review + Business Verification | needed for `leads_retrieval`/`pages_manage_ads` before any real lead is readable | https://developers.facebook.com/docs/marketing-api/guides/lead-ads/ |
| 90-day lead expiry | webhook-ingest immediately; expired leads are gone | https://en-gb.facebook.com/business/help/1526849577619206 |
| Rate limits | leadgen-call limit per Page (error 80005); lead reads capped at 200×24×leads-in-90d/24h | https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ , .../lead-ads/retrieving |
| `privacy_policy.link_text` ≤ 70 chars | over-limit surfaces as opaque error | https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ |
| `link` in creative must be `https://fb.me/` | any other URL rejected | https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create |
| CTA whitelist | APPLY_NOW / DOWNLOAD / GET_QUOTE / LEARN_MORE / SIGN_UP / SUBSCRIBE | https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create |
| Locale | prefill question labels render per form `locale` — set `DE_DE` explicitly | https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ |
| One test lead per form | delete before re-testing | https://developers.facebook.com/docs/marketing-api/guides/lead-ads/testing-troubleshooting/ |
| No documented max-question count | not stated in dev docs or edge reference; Ads Manager UI historically caps custom questions, but no primary-source number — validate empirically | (absence noted across all pages fetched) |
| "HIGHER_INTENT" is not an API enum | use `is_optimized_for_quality=true` | https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create |

Open question for implementation: `special_ad_categories` — recruiting ads are the EMPLOYMENT special ad category; the lead-ads doc example shows `["NONE"]` but our job-recruiting campaigns must declare `EMPLOYMENT` (targeting restrictions apply). Verify against the ad-account campaign reference when building the wizard.

---

## Follow-up: conditional logic and multiple endings

Date: 2026-08-16 (follow-up pass)
Doc versions observed this pass: `page/leadgen_forms` edge reference and the **Lead Gen Data** node reference both render **v26.0**; the Marketing API lead-ads create guide still shows **v25.0** examples; archived pages consulted for the conditional-questions mechanism render **v2.11 / v2.12**.

### F1. The blocking question: two endings chosen by the answer — **NO, not via the API**

**Answer: No.** A form created through `POST /{page-id}/leadgen_forms` can carry exactly **one** ending screen. There is no plural parameter and no conditional variant.

Grounding — the complete POST parameter list on the edge reference (v26.0) is:
`allow_organic_lead_retrieval`, `block_display_for_non_targeted_viewer`, `context_card`, `custom_disclaimer`, `follow_up_action_url`, `is_for_canvas`, `is_lead_capture_ai_agent_enabled`, `is_optimized_for_quality`, `is_phone_sms_verify_enabled`, `locale`, `name`, `privacy_policy`, `question_page_custom_headline`, `questions`, `thank_you_page`, `tracking_parameters`, `upload_gated_file`.
There is **no** `thank_you_pages`, no `endings`, no `end_pages`, no `conditional_thank_you_page`, and no sub-field on `thank_you_page` that carries a condition. `thank_you_page` is a single Object whose sub-fields are `title` (required), `button_type` (required), `body`, `short_message`, `button_text`, `button_description`, `business_phone_number`, `website_url`, `country_code`, `enable_messenger`, `gated_file`, `id`.
Source: https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ (v26.0)

The read side agrees. The form node ("Lead Gen Data", described as "A lead ad form") exposes exactly these fields:
`id`, `allow_organic_lead`, `block_display_for_non_targeted_viewer`, `context_card` (LeadGenContextCard), `created_time`, `expired_leads_count`, `follow_up_action_text`, `follow_up_action_url`, `is_optimized_for_quality`, `leads_count`, `legal_content` (LeadGenLegalContent), `locale`, `name`, `organic_leads_count`, `page`, `page_id`, `privacy_policy_url`, `question_page_custom_headline`, `questions` (list&lt;LeadGenQuestion&gt;), `status`, `thank_you_page` (**singular**, LeadGenThankYouPage), `tracking_parameters`. Edges: `leads`, `test_leads`.
Source: https://developers.facebook.com/docs/graph-api/reference/lead-gen-data/ (v26.0)

### F2. The Ads-Manager "conditional logic" feature is **UI-only** — this is the single most important finding

The Business Help Center article for the feature opens with an explicit availability banner:

> "This feature is only available through lead ad with instant form creation in Meta Ads Manager."

Source: https://www.facebook.com/business/help/3373123166040766 (rendered with `?locale=en_US`)

That article describes exactly the branching behaviour we wanted. Verbatim mechanics:

- "This dynamic form changes what question or landing page a person sees next based on their answer in real time."
- In the **Questions** section you toggle on **Conditional logic**, add a **Multiple choice** question, and then per answer, under **Logic → Choose next step**, pick one of three next steps:
  - **Go to a question** — "Directs the lead to see a new or existing question."
  - **Submit form** — "Collects the information from your lead and directs them to a custom end page."
  - **Close form** — "Considers the person as a non-lead and directs them to a custom end page."
- "Repeat this step for all the answers to your question. Ensure that at least one logic is **Submit form** and **Close form**."
- For **Submit form** you pick either "**End page for leads** to show them the default end page" or "**Create new end page** to show them a page with a call to action". End-page CTAs offered: **View website** (URL), **Call business** (phone + CTA text), **View file** (CTA text + uploaded file).
- For **Close form**: "A pop-up will appear to confirm a new end page has been created… Click the **End page**, to enter a headline, description and call to action to complete the new end page for non-leads."
- Consequence for lead delivery: "Only the people who answer with a response determined to be a lead will be able to submit the form and qualify as leads. **You won't receive the information for anyone who responds with an answer that closes the form.**"
- Notes: "The use of conditional logic may increase your cost per lead." / "Instant forms that include conditional logic can be delivered to desktop and mobile on both Android and iOS platforms." No limit on the number of conditions or end pages is stated.

So the product **does** have qualified-vs-disqualified endings — it is just not exposed on the create endpoint. Corroborating absence: the current Marketing API create guide (full page text, 27,232 chars) contains **zero** occurrences of the string "conditional".
Source: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create

**Implication for the wizard:** a two-ending qualifier form cannot be produced programmatically. Options, in order of how much we'd hate them:
1. Ship a single-ending API form and do disqualification downstream in our own CRM/webhook consumer (we get *all* submissions, including unqualified ones — arguably better data for an agency).
2. Have the client build one conditional-logic template form by hand in Ads Manager once, then reuse it — but forms are Page-scoped and immutable, so at ~200 Pages this is ~200 manual builds. Contradicts the no-manual-steps constraint.
3. Approximate qualification with `is_optimized_for_quality: true` (review step) and/or `is_phone_sms_verify_enabled: true`. These raise quality but do not branch endings.

### F3. Is there an API-level notion of a *disqualifying* answer? **No.**

- No field on the create parameter list or the form node relates to qualification/filtering/routing (see the exhaustive lists in F1). The only quality-adjacent knobs are `is_optimized_for_quality`, `is_phone_sms_verify_enabled`, `should_enforce_work_email`, and `block_display_for_non_targeted_viewer`.
- A `leadgen_qualifiers` Page edge **used to** exist — "List of qualifiers available on a page, includes advertiser customized qualifiers" — read-only, no parameters (archived v2.12 reference). It is **gone**: `https://developers.facebook.com/docs/graph-api/reference/page/leadgen_qualifiers/` now returns *Page Not Found*, and the current Page node reference (v26.0) lists no such edge.
  Current Page node reference: https://developers.facebook.com/docs/graph-api/reference/page/ — its only leadgen edge is `leadgen_forms`; the page contains zero occurrences of "conditional".
- Also gone from the current reference: `page/leadgen_draft_forms` and `page/leadgen_conditional_questions_group` (both 404 today), even though `status` on the form node still accepts `DRAFT`.

### F4. How `dependent_conditional_questions` / `conditional_questions_group_id` actually work

**Important correction to expectations:** this is *not* "show question B if the answer is X". It is a **cascading dropdown group** (the classic Country → State → City narrowing), driven by a **CSV of valid combinations** uploaded ahead of time. Answer-values are matched by **CSV row**, not by per-answer condition objects, and every respondent sees the same chain of dependent questions — only the available *options* narrow. It cannot route to different questions, and it cannot route to different endings.

Current documentation status: the v26.0 edge reference lists both fields on the question object but **prints no description for either** —
`dependent_conditional_questions` : `array<JSON object>` (no description), `conditional_questions_group_id` : `numeric string` (no description).
Source: https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ (v26.0)

The mechanism is only described in **archived** Meta developer docs (the live pages 404 / no longer contain the section). Archived primary sources:
- https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create/ — "Add Conditional Questions" section, snapshot 2018-03-09 (examples pinned v2.11), via web.archive.org
- https://developers.facebook.com/docs/graph-api/reference/page/leadgen_conditional_questions_group/ — snapshot 2018-03-09, v2.12, via web.archive.org

**Step 1 — upload the CSV, get a group id.** The archived edge reference documents exactly one POST parameter, `conditional_questions_group_csv` (type `file`, **required**), described as the CSV file that contains the data for creating a set of conditional questions. No Graph object is created; the return type is `Struct { id: numeric string }` (read-after-write supported). Reading the edge returns `{"data":[],"paging":{}}` — a list of `LeadGenConditionalQuestionsGroup` nodes. Updating and deleting: "You can't perform this operation on this endpoint."

```bash
curl -X POST \
  -F 'conditional_questions_group_csv=@qualifikationen.csv;type=text/csv' \
  -F 'access_token={PAGE_ACCESS_TOKEN}' \
  "https://graph.facebook.com/v26.0/{PAGE_ID}/leadgen_conditional_questions_group"
# -> {"id":"<CONDITIONAL_QUESTIONS_GROUP_ID>"}
```

CSV shape (inferred from the documented Country/State/City example; Meta's linked example file is no longer reachable): **column 1 = the parent question's label, each following column = one dependent question name, one row per valid combination.**

```csv
Qualifikation,Fachbereich,Einsatzort
Examinierte Pflegefachkraft,Ambulante Pflege,Dresden
Examinierte Pflegefachkraft,Ambulante Pflege,Leipzig
Examinierte Pflegefachkraft,Intensivpflege,Dresden
Pflegehelfer:in,Ambulante Pflege,Dresden
Pflegehelfer:in,Betreuung,Leipzig
```

**Step 2 — reference the group from a `CUSTOM` question whose `label` equals CSV column 1.** The archived guide's exact question object (verbatim, Country/State/City):

```json
{"type":"CUSTOM","label":"Country","conditional_questions_group_id":"<CONDITIONAL_QUESTIONS_GROUP_ID>","dependent_conditional_questions":[{"name":"State"},{"name":"City"}]}
```

So: `conditional_questions_group_id` and `dependent_conditional_questions` both live on the **parent** question. The dependent questions are declared only as `{"name": "<CSV column header>"}` objects, **in the order you want them selected** — there is no separate question object for them in the `questions` array, and no `key`/`type`/`options` of their own.

Worked payload in our domain:

```bash
curl -X POST "https://graph.facebook.com/v26.0/{PAGE_ID}/leadgen_forms" \
  -F 'access_token={PAGE_ACCESS_TOKEN}' \
  -F 'name=Pflegekraft Bewerbung 2026 – Qualifikation' \
  -F 'locale=DE_DE' \
  -F 'privacy_policy={"url":"https://client.example/datenschutz","link_text":"Datenschutzerklärung"}' \
  -F 'questions=[
        {"type":"FULL_NAME","key":"question1"},
        {"type":"EMAIL","key":"question2"},
        {"type":"PHONE","key":"question3"},
        {"type":"CUSTOM",
         "key":"question4",
         "label":"Qualifikation",
         "conditional_questions_group_id":"<CONDITIONAL_QUESTIONS_GROUP_ID>",
         "dependent_conditional_questions":[{"name":"Fachbereich"},{"name":"Einsatzort"}]}
      ]' \
  -F 'thank_you_page={"title":"Danke!","button_type":"VIEW_WEBSITE","body":"Wir melden uns innerhalb von 48 Stunden.","button_text":"Mehr erfahren","website_url":"https://client.example/karriere"}'
```

What the respondent sees: pick **Qualifikation** → the **Fachbereich** dropdown is filtered to the rows matching that pick → the **Einsatzort** dropdown is filtered to the rows matching both. Everyone lands on the same `thank_you_page`.

What you **cannot** express: "if Qualifikation = Pflegehelfer:in then ask about Ausbildungsbereitschaft, else ask about Fachbereich", and "if Pflegehelfer:in then show the disqualified ending". Both are the Ads-Manager-only conditional-logic feature (F2).

Answers come back in `field_data` like any other question — one `name`/`values` entry per question in the chain.
Source (archived): https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create/

**Nesting-depth limit:** none documented, anywhere. The archived guide's example uses depth 3 (parent + 2 dependents); no maximum is stated on the edge reference, the create guide, or the archived group reference. Validate empirically.

**Risk flag:** `leadgen_conditional_questions_group` has no live reference page. The two question fields survive in the v26.0 reference with empty descriptions, which suggests the parameters are still accepted, but treat this as undocumented surface — probe with a throwaway Page before designing around it.

### F5. Public / open sharing — confirmed: `block_display_for_non_targeted_viewer: false` = **Open**

- API: the reference describes the flag as "Whether to make the organic post invisible to viewers in non-Ad context". The create guide uses `true` "To filter out organic leads", and states that setting it to **`false`** "marks the form as **Open Sharing**" (it is a prerequisite for Messenger-eligible forms).
  https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ , https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create
- UI side confirms the polarity and the default: "If you don't want to receive organic leads, select **Sharing > Restricted** in the **Settings** section of your Instant Form. **This is the default option when you create an instant form.**" and "You can only receive organic leads if you select the **Form Configuration > Sharing > Open** option".
  https://www.facebook.com/business/help/1131888990173231
- Mapping: `block_display_for_non_targeted_viewer = false` ⇔ Sharing **Open** (public, Share button present, organic leads collected). `= true` ⇔ Sharing **Restricted**. The API default is *not* stated on the edge reference; the UI default is Restricted. **Set it explicitly.**
- Side effects of Open worth knowing: the ad unit gains a **Share** button; organic leads are excluded from the Ads Manager **Results** column and are only downloadable from Meta Business Suite, not Ads Manager.

`allow_organic_lead_retrieval` is the deprecated predecessor — "Previously, this flag controlled whether any leads submitted in a non-Ad context were retrievable"; it is now ignored, and the reference points you at `block_display_for_non_targeted_viewer`.

### F6. Intro screen (`context_card`) — confirmed sub-fields and limits

API sub-fields (edge reference, v26.0): `title` (string), `style` (enum `LIST_STYLE` | `PARAGRAPH_STYLE`), **`content` (array&lt;string&gt;)**, `button_text` (string), `cover_photo_id` (numeric string). A separate `cover_photo` file param exists ("Custom cover photo for context card") and requires **`pages_manage_posts`** on the token.
https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/

So `content` is **always a list of strings**; `style` decides whether that list renders as bullets (`LIST_STYLE`) or as running text (`PARAGRAPH_STYLE`). For a paragraph, pass a one-element array.

**Cover photo is not required.** The whole `context_card` object is optional ("Optional context card shown as the intro page"), and even in Ads Manager the background image defaults to the ad's image: "Go to **Background image** and select the image you want to display behind your form. You can select **Use the image from your ad** or **Use uploaded image**."

Character limits (documented on the UI side only, no limits appear in the API reference):
- Intro **Headline** — "no longer than **60 characters**"
- Intro **Description** — choose **Paragraph** or **List**; "There is a maximum limit of **80 characters per bullet point** in the list format"
- (Rich-creative intro variant: 1–3 **Benefits**, max **57 characters** per benefit field)
Source: https://www.facebook.com/business/help/1664458123767694

Ending screen, for symmetry — Ads Manager calls it **Ending → Message for leads**; "Edit the **Headline** if needed. You can use up to **60 characters**." CTA options map to the API `button_type` enum (View website / View file / Call business / Book time / Chat on WhatsApp / Redeem promo code). Gated files: "PDF, JPEG and PNG… (up to **10MB, 1080 pixels wide**)".
Source: https://www.facebook.com/business/help/314132612401196

### F7. Immutability re-confirmed at the reference level — `status` is the only writable field

The Lead Gen Data node's **Updating** section is unambiguous. "You can update a LeadGenData by making a POST request to `/{lead_gen_data_id}`", and the parameter table has exactly **one** row:

| Parameter | Type | Description |
|---|---|---|
| `status` | enum `{ACTIVE, ARCHIVED, DELETED, DRAFT}` | "The status of the lead ad form. It can be either ACTIVE, ARCHIVED, or DRAFT." |

Return type `Struct { success: bool }`. **Deleting**: "You can't perform this operation on this endpoint."
Source: https://developers.facebook.com/docs/graph-api/reference/lead-gen-data/ (v26.0)

`questions`, `thank_you_page`, `context_card`, `privacy_policy`, `locale`, `name` — **none** of them appear in the Updating parameter list. They are create-time only. (Note the enum accepts `DELETED` and `DRAFT` even though the description text names only three values and the create guide only documents `ARCHIVED`/`ACTIVE`; don't rely on `DELETED`.)
Matches §4 and the Business Help Center: a published instant form can't be edited, only duplicated.

### F8. Follow-up gotcha table

| Gotcha | Detail | Source |
|---|---|---|
| **Two endings are impossible via API** | Ads-Manager-only feature; explicit availability banner | https://www.facebook.com/business/help/3373123166040766 |
| No `thank_you_pages` / `endings` param | Exhaustive create-param list and node field list both show a single `thank_you_page` | https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ , https://developers.facebook.com/docs/graph-api/reference/lead-gen-data/ |
| "Close form" answers produce **no lead at all** | "You won't receive the information for anyone who responds with an answer that closes the form" | https://www.facebook.com/business/help/3373123166040766 |
| Conditional logic raises CPL | "The use of conditional logic may increase your cost per lead" | https://www.facebook.com/business/help/3373123166040766 |
| `dependent_conditional_questions` ≠ branching | Cascading CSV-driven dropdowns only; same chain for everyone | archived https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create/ (v2.11 snapshot) |
| CSV endpoint is undocumented today | `page/leadgen_conditional_questions_group` reference 404s; fields kept in v26.0 reference with **empty descriptions** | https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ |
| `leadgen_qualifiers` edge removed | Existed at v2.12, 404 today; no qualification API remains | archived v2.12 reference; current https://developers.facebook.com/docs/graph-api/reference/page/ |
| Sharing default differs UI vs API | UI default = Restricted; API default unstated → always send `block_display_for_non_targeted_viewer` explicitly | https://www.facebook.com/business/help/1131888990173231 |
| Organic leads invisible in Ads Manager Results | Only downloadable via Meta Business Suite | https://www.facebook.com/business/help/1131888990173231 |
| `context_card.content` is an **array** | Even for `PARAGRAPH_STYLE` — pass a single-element array | https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ |
| Intro headline ≤ 60 chars, list bullets ≤ 80 chars | UI-documented; not enforced-documented in the API reference | https://www.facebook.com/business/help/1664458123767694 |
| Only `status` is updatable | Reference Updating table has one row | https://developers.facebook.com/docs/graph-api/reference/lead-gen-data/ |

---

## Gemessen am eigenen Bestand (2026-08-16)

Alles bisher Genannte stammt aus Metas Dokumentation. Dieser Abschnitt stammt
aus Messungen gegen das eigene Business (`129036263212085`, v26.0) — er hat
Vorrang, wo die Referenz etwas anderes behauptet.

### M1. `follow_up_action_url` ist Pflicht, nicht optional

Die Referenz führt das Feld als optional. Ohne es antwortet Graph beim Anlegen:

```
Fehlende(s) Feld(er): FollowUpActionURL
```

Immer mitschicken — die Website des Kunden, bei manchen ein `wa.me`-Link.

### M2. Entwürfe gibt es über die API nicht

Zwei Wege probiert, beide gescheitert:

| Versuch | Antwort |
|---|---|
| `POST /{form-id}` mit `status=DRAFT` nach dem Anlegen | `Mutation auf ACTIVE form ist nicht zulässig` |
| `status=DRAFT` beim Anlegen mitgeschickt | angenommen, **stillschweigend verworfen** — liest sich danach als `ACTIVE` |

Keine Entwurfs-Edge: `leadgen_draft_forms` wird als nicht existierendes Feld
abgelehnt, `leadgen_forms_draft` und `leadgen_form_drafts` als unbekannte Pfade.

**Folge:** Ein per API angelegtes Formular ist sofort aktiv und damit für immer
unveränderlich — auch in Metas eigener Oberfläche. Bedingte Logik und eine
zweite Zielseite lassen sich nachträglich nie ergänzen. Wer das braucht, baut
das Formular im Baukasten.

### M3. Feldprobe am Formular-Knoten

Kandidatennamen einzeln gegen `GET /{form-id}?fields=…` geprüft. Angenommen
werden nur: `thank_you_page` (Einzahl), `context_card`, `legal_content`, `page`,
`page_id`, `allow_organic_lead`.

Abgelehnt als nicht existierend: `thank_you_pages`, `endings`, `ending_pages`,
`completion_pages`, `custom_endings`, `conditional_logic`, `logic`,
`question_flow`, `flow`, `routing`, `next_step`, `branching`, `disqualification`,
`lead_qualification`, `qualifiers`, `is_conditional`, `has_conditional_logic`,
`questions_flow`, `form_flow`, `cover_photo_id`, `messenger_welcome_message`,
`creator`, `leadgen_export_csv_url`, `organic_lead_form`.

Bedingte Logik und mehrere Zielseiten kommen im Datenmodell also gar nicht vor —
das ist keine Lücke in der Dokumentation, sondern im Produkt der API.

### M4. Was 249 Formulare tatsächlich enthalten

Alle Formulare der 40 Kundenseiten gelesen:

| Merkmal | Bestand |
|---|---|
| `locale: de_DE` | 243 / 249 |
| `block_display_for_non_targeted_viewer: false` (öffentlich) | 225 / 249 |
| `context_card.style: PARAGRAPH_STYLE` | 235 / 249 |
| mit `thank_you_page` | 50 / 249 (nie mehr als eine) |
| mit bedingter Logik | 0 / 249 — die API kann sie ohnehin nicht zeigen (M3) |
| Status | 231 `ACTIVE`, 18 `ARCHIVED` |

Häufigste Fragen: `Full name` (242), `Phone number` (241), `Email` (240),
„Wann bist du am besten erreichbar?" (119 wörtlich, ~31 in Varianten),
„Hast du einen Führerschein?" (88).

Die Intro-Karte nennt den **Ort**, nicht den Kundennamen: „Bewirb dich bei uns
in Hennef 🫶🏻", darunter „Beantworte uns dazu ein paar Fragen und sag uns wie wir
dich erreichen können." `tracking_parameters` trägt `{ Standort: … }`.

Die `-copy`- und `-copy-copy`-Namen im Bestand sind kein Schlamperei-Muster,
sondern die Folge der Unveränderlichkeit: geändert wird durch Duplizieren.

### M5. Nicht lesbare Felder

`privacy_policy` und `custom_disclaimer` sind Schreib-, keine Lesefelder. Beim
Lesen kommt der Datenschutz-Link stattdessen unter `legal_content.privacy_policy`.
