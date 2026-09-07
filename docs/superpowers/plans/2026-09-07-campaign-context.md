# Shared Campaign Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the selected ClickUp task, onboarding facts, and user notes in one resolved campaign context used by every AI generation request.

**Architecture:** Keep the existing independent source readers, then reconcile their structured evidence in one final Mistral call behind `assembleBrief()`. Persist user notes and resolved copy instructions in `WizardState`; make provenance multi-source while retaining hydration compatibility for old drafts.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Bun tests, Astryx Design Core

**Spec:** `docs/superpowers/specs/2026-09-07-campaign-context-design.md`

## Global Constraints

- Load exactly one selected ClickUp task; never discover or merge sibling tasks.
- Never send the raw ClickUp customer overview to Mistral.
- Use `aiNotes` for user instructions; keep existing `notes` as the raw task description.
- Reject notes longer than 4,000 characters at the route.
- Add no dependency.
- Preserve a usable deterministic brief when reconciliation fails.

---

### Task 1: Campaign evidence and reconciliation

**Files:**
- Modify: `lib/brief.ts`
- Modify: `lib/brief.test.ts`

**Interfaces:**
- Consumes: existing `BriefDeps`, task extraction, onboarding extraction, and `overviewFacts()` output.
- Produces: `assembleBrief(taskId: string, aiNotes?: string, deps?: BriefDeps, emit?: OnBriefEvent): Promise<AssembledBrief>`, multi-source `Sourced<T>`, `copyInstructions`, and a deterministic fallback.

- [ ] **Step 1: Write failing reconciliation tests**

Add tests that inject Mistral responses and assert that task plus onboarding roles can both survive, explicit notes override conflicting roles and budget, sources are retained, and a reconciliation error returns the old task-first fallback with a warning. Assert `getBrief` receives only the selected task ID.

```ts
expect(out.roles).toEqual({ value: ["PFK", "PA"], sources: ["clickup", "onboarding"] });
expect(out.dailyBudgetEuros).toEqual({ value: 40, sources: ["user"] });
expect(taskIds).toEqual(["selected"]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test lib/brief.test.ts`

Expected: FAIL because `assembleBrief` has no user-notes input, no reconciliation response, and `Sourced` has only one `source`.

- [ ] **Step 3: Implement the minimum deep module**

Add the evidence and resolved-context types, one reconciliation prompt/parser, and call it after source collection. Normalize all source arrays and validated numeric fields. Keep the current merge code as the catch-path fallback. Add a `context` `BriefStep` so the existing stream exposes reconciliation progress.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `bun test lib/brief.test.ts`

Expected: PASS.

### Task 2: Validated POST brief stream

**Files:**
- Modify: `app/api/brief/route.ts`
- Create: `app/api/brief/route.test.ts`
- Modify: `app/campaigns/new/wizard.tsx`

**Interfaces:**
- Consumes: JSON `{ taskId: string; aiNotes?: string }`.
- Produces: the existing NDJSON `BriefStreamEvent` response.

- [ ] **Step 1: Read the installed Next.js route-handler guide**

Read `node_modules/next/dist/docs/01-app/03-building-your-application/01-routing/13-route-handlers.md` before changing the handler.

- [ ] **Step 2: Write failing route validation tests**

Test missing/invalid JSON, missing task ID, non-string notes, and 4,001-character notes. Assert status 400 and keep the successful response as NDJSON.

```ts
const response = await POST(new Request("http://local/api/brief", {
  method: "POST",
  body: JSON.stringify({ taskId: "t1", aiNotes: "Nur PFK" }),
}));
expect(response.headers.get("content-type")).toContain("application/x-ndjson");
```

- [ ] **Step 3: Run the route test and verify RED**

Run: `bun test app/api/brief/route.test.ts`

Expected: FAIL because the route exports `GET`, not `POST`.

- [ ] **Step 4: Implement POST and update the client**

Parse and validate the body before opening the stream. Call `assembleBrief(taskId, aiNotes, undefined, emit)`. Change `pick()` to send JSON by POST.

- [ ] **Step 5: Run route and brief tests and verify GREEN**

Run: `bun test app/api/brief/route.test.ts lib/brief.test.ts`

Expected: PASS.

### Task 3: Notes, provenance, and draft compatibility

**Files:**
- Modify: `app/campaigns/new/state.ts`
- Modify: `app/campaigns/new/state.test.ts`
- Modify: `app/campaigns/new/herkunft.tsx`
- Create: `app/campaigns/new/herkunft.test.ts`
- Modify: `app/campaigns/new/auftrag.tsx`
- Modify: `app/campaigns/new/vorschlag.tsx`
- Modify: `app/campaigns/new/wizard.tsx`
- Modify: `app/campaigns/new/werkstatt.tsx`

**Interfaces:**
- Consumes: `AssembledBrief` with `sources[]`, `copyInstructions`, and the notes typed before task selection.
- Produces: persisted `WizardState.aiNotes`, `WizardState.copyInstructions`, multi-source field badges, and an editable notes field.

- [ ] **Step 1: Write failing state and provenance tests**

Assert `applyBrief()` stores the resolved values and arrays of sources, `hydrate()` supplies empty strings and upgrades old single-source values, and the provenance label joins multiple sources in stable order.

```ts
expect(state.aiNotes).toBe("Nur PFK");
expect(state.sources.roles).toEqual(["clickup", "onboarding"]);
expect(herkunftLabel(["user", "clickup"])).toBe("aus deinem Hinweis + ClickUp");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test app/campaigns/new/state.test.ts app/campaigns/new/herkunft.test.ts`

Expected: FAIL because the new fields, source arrays, and label helper do not exist.

- [ ] **Step 3: Implement state and UI changes**

Add `aiNotes` and `copyInstructions` with hydration defaults. Change wizard provenance to `Source[]` and normalize old strings. Add Astryx `TextArea` to the task list and proposal header, threading its value through `pick()`. Add the `context` activity row and multi-source badge label.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test app/campaigns/new/state.test.ts app/campaigns/new/herkunft.test.ts`

Expected: PASS.

### Task 4: Complete context in every generation request

**Files:**
- Modify: `lib/bodies.ts`
- Modify: `lib/bodies.test.ts`
- Modify: `app/campaigns/new/ad-set-block.tsx`
- Modify: `app/campaigns/new/wizard.tsx`

**Interfaces:**
- Consumes: `BodiesInput.instructions?: string` from `WizardState.copyInstructions` and the current editable `aiNotes`.
- Produces: body, title, and description prompts that all contain the same instructions while preserving their existing hard constraints.

- [ ] **Step 1: Write failing prompt-context tests**

Expose no new prompt interface. Stub `fetch`, call `generateBody`, `generateTitles`, and `generateDescription`, and inspect each outbound request body for a shared instruction marker and the supplied note.

```ts
expect(sent.every((request) => request.includes("ZUSÄTZLICHE KAMPAGNENHINWEISE") && request.includes("Keine Emojis"))).toBe(true);
```

- [ ] **Step 2: Run the body tests and verify RED**

Run: `bun test lib/bodies.test.ts`

Expected: FAIL because `BodiesInput` and the prompts ignore instructions.

- [ ] **Step 3: Implement prompt propagation**

Add the optional field once and render it through one small prompt fragment reused by all three prompt builders. Pass the merged resolved instructions and current `aiNotes` into each generation action from `AdSetBlock`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test lib/bodies.test.ts app/campaigns/new/state.test.ts lib/brief.test.ts`

Expected: PASS.

### Task 5: Full verification

**Files:**
- Modify only files required by failures caused by this change.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: verified repository state.

- [ ] **Step 1: Run all tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 2: Run TypeScript**

Run: `bunx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Run the production build**

Run: `bun run build`

Expected: exit 0.

- [ ] **Step 4: Review the final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only planned source, test, plan, and generated Next.js agent-instruction changes are present.
