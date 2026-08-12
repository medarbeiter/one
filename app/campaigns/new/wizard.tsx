"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  Disclosure,
  Input,
  Label,
  NumberField,
  Tabs,
  TextField,
} from "@heroui/react";
import { campaignName, ROLES } from "@/lib/naming";
import { label } from "@/lib/labels";
import type { AdSetInput } from "@/lib/launch";
import { emptyAdSet, initialState, useWizardState } from "./state";
import { AdSetBlock } from "./ad-set-block";
import { Preview } from "./preview";
import { launchAction, type LaunchState, type WizardSubmission } from "../actions";

type WizardCustomer = {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  igId?: string;
  adAccounts: { id: string; name: string }[];
};

const field = "border-line bg-surface h-10 w-full rounded-md border px-3 text-sm";

const STEPS = ["Campaign", "Ad sets", "Review"];

export function Wizard({
  customers,
  knownInitials,
  defaultCustomer,
}: {
  customers: WizardCustomer[];
  knownInitials: string[];
  defaultCustomer: string;
}) {
  const [state, setState] = useWizardState(initialState(defaultCustomer));
  const [step, setStep] = useState("0");
  const [result, submit, pending] = useActionState<LaunchState, WizardSubmission>(
    launchAction,
    {},
  );

  const customer = customers.find((c) => c.id === state.customerId);

  // Der Name folgt Business/Rollen/Datum/Initialen, solange niemand ihn von
  // Hand angefasst hat – siehe nameEdited in state.ts.
  const composed = campaignName({
    business: state.business,
    roles: state.roles,
    roleFreeText: state.roleFreeText,
    start: new Date(state.startDate),
    initials: state.initials,
  });
  useEffect(() => {
    if (!state.nameEdited) setState((s) => ({ ...s, campaignName: composed }));
  }, [composed, state.nameEdited, setState]);

  const updateAdSet = (i: number, patch: Partial<AdSetInput>) =>
    setState((s) => ({
      ...s,
      adSets: s.adSets.map((set, idx) => (idx === i ? { ...set, ...patch } : set)),
    }));

  const removeAdSet = (i: number) =>
    setState((s) => ({ ...s, adSets: s.adSets.filter((_, idx) => idx !== i) }));

  const addLocation = () =>
    setState((s) => ({ ...s, adSets: [...s.adSets, emptyAdSet(s.adSets.length)] }));

  const onCreate = () =>
    startTransition(() =>
      submit({
        customerId: state.customerId,
        campaignName: state.campaignName,
        dailyBudgetCents: Math.round(state.dailyBudgetEuros * 100),
        spendCapCents: state.spendCapEuros
          ? Math.round(state.spendCapEuros * 100)
          : undefined,
        // id ist nur fürs React-key – AdSetInput (der API-Vertrag) kennt sie nicht.
        adSets: state.adSets.map(({ id: _id, ...rest }) => rest),
      }),
    );

  return (
    <Card>
      <Card.Header>
        <Card.Title>New campaign</Card.Title>
        <Card.Description>
          Creates campaign, ad set and one ad per file — all paused.
        </Card.Description>
      </Card.Header>

      <Tabs selectedKey={step} onSelectionChange={(k) => setStep(String(k))}>
        <Tabs.List>
          {STEPS.map((s, i) => (
            <Tabs.Tab key={i} id={String(i)}>
              {i + 1}. {s}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel id="0" className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Customer (ad account)</Label>
            <select
              className={field}
              value={state.customerId}
              onChange={(e) => setState((s) => ({ ...s, customerId: e.target.value }))}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Business ist der beworbene Kunde, nicht das Werbekonto – die Liste
              dient nur als Vorschlag, Freitext bleibt möglich (Kunde evtl. nicht
              in der Config). */}
          <TextField
            value={state.business}
            onChange={(business) => setState((s) => ({ ...s, business }))}
            isRequired
            className="space-y-1 sm:col-span-2"
          >
            <Label>Business (client being advertised)</Label>
            <Input list="business-suggestions" placeholder="e.g. Herzhalt Pflegedienst GmbH" />
          </TextField>
          <datalist id="business-suggestions">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>

          <div className="space-y-1 sm:col-span-2">
            <Label>Roles</Label>
            <CheckboxGroup
              value={state.roles}
              onChange={(roles) => setState((s) => ({ ...s, roles }))}
              // HeroUI's .checkbox-group ist standardmäßig flex-col; flex-wrap
              // allein ändert daran nichts (andere CSS-Eigenschaft) – ohne
              // flex-row bleibt es eine lange einspaltige Liste.
              className="flex flex-row flex-wrap gap-x-4 gap-y-2"
            >
              {ROLES.map((r) => (
                // Control muss in Content verschachtelt sein, nicht daneben: Content
                // rendert das <label>, das den (visuell versteckten) <input> enthält –
                // nur was darin liegt, ist per Klick erreichbar. Als Geschwister blieb
                // die Box tot und die Gruppe fiel in .checkbox' flex-col auseinander.
                <Checkbox key={r.code} value={r.code}>
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    {r.label}
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </CheckboxGroup>
          </div>

          <TextField
            value={state.roleFreeText}
            onChange={(roleFreeText) => setState((s) => ({ ...s, roleFreeText }))}
            className="space-y-1 sm:col-span-2"
          >
            <Label>Other role (free text, e.g. “Koch”)</Label>
            <Input />
          </TextField>

          <div className="space-y-1">
            <Label>Initials</Label>
            <div className="flex gap-2">
              <select
                className={field}
                value={knownInitials.includes(state.initials) ? state.initials : ""}
                onChange={(e) => setState((s) => ({ ...s, initials: e.target.value }))}
              >
                <option value="" disabled>
                  Select…
                </option>
                {knownInitials.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <TextField
                value={state.initials}
                onChange={(initials) => setState((s) => ({ ...s, initials }))}
                className="w-24"
              >
                <Input aria-label="Custom initials" placeholder="Other" />
              </TextField>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Start date</Label>
            <input
              type="date"
              className={field}
              value={state.startDate}
              onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
            />
          </div>

          <TextField
            value={state.campaignName}
            onChange={(campaignNameValue) =>
              setState((s) => ({ ...s, campaignName: campaignNameValue, nameEdited: true }))
            }
            isRequired
            className="space-y-1 sm:col-span-2"
          >
            <Label>Campaign name</Label>
            <Input />
          </TextField>

          <div className="space-y-1">
            <Label>Daily budget</Label>
            <NumberField
              aria-label="Daily budget"
              value={state.dailyBudgetEuros}
              onChange={(dailyBudgetEuros) => setState((s) => ({ ...s, dailyBudgetEuros }))}
              minValue={1}
              step={1}
              formatOptions={{ style: "currency", currency: "EUR" }}
            >
              <NumberField.Group>
                <NumberField.Input />
              </NumberField.Group>
            </NumberField>
          </div>

          <TextField
            value={state.spendCapEuros !== undefined ? String(state.spendCapEuros) : ""}
            onChange={(v) =>
              setState((s) => ({
                ...s,
                spendCapEuros: v.trim() === "" ? undefined : Number(v),
              }))
            }
            className="space-y-1"
          >
            <Label>Spend cap (optional, min. 100 €)</Label>
            <Input type="number" step="0.01" />
          </TextField>

          <Disclosure className="sm:col-span-2">
            <Disclosure.Heading>
              <Disclosure.Trigger>Advanced</Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="space-y-1 text-sm">
                <p>Objective: {label("OUTCOME_LEADS")}</p>
                <p>Optimisation goal: {label("LEAD_GENERATION")}</p>
                <p>Destination type: {label("ON_AD")}</p>
                <p>Bid strategy: {label("LOWEST_COST_WITHOUT_CAP")}</p>
                <p>Billing event: {label("IMPRESSIONS")}</p>
                <p>Special ad category: {label("EMPLOYMENT")}</p>
                <p>Country: {label("DE")}</p>
                <p>
                  Placements: {label("feed")}, {label("stream")}, {label("story")}
                </p>
                <p className="text-ink-500">
                  All read-only in v1 — the daily budget above is the only editable amount.
                </p>
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        </Tabs.Panel>

        <Tabs.Panel id="1" className="space-y-3 p-4">
          {state.adSets.map((set, i) => (
            // Vorschau steht neben dem Block, nicht dahinter – die Texte werden
            // für sie geschrieben, nicht für die Felder (siehe preview.tsx).
            <div key={set.id} className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <AdSetBlock
                value={set}
                index={i}
                pageId={customer?.pageId ?? ""}
                instagramUserId={customer?.igId}
                adAccount={customer?.adAccounts[0]?.id ?? ""}
                onChange={(patch) => updateAdSet(i, patch)}
                onRemove={() => removeAdSet(i)}
                canRemove={state.adSets.length > 1}
              />
              <Preview adSet={set} pageName={customer?.pageName ?? ""} />
            </div>
          ))}
          <Button variant="outline" onPress={addLocation}>
            Add location
          </Button>
        </Tabs.Panel>

        <Tabs.Panel id="2" className="space-y-4 p-4 text-sm">
          <div className="space-y-1">
            <p>
              <strong>Customer:</strong> {customer?.name ?? "—"}
            </p>
            <p>
              <strong>Business:</strong> {state.business || "—"}
            </p>
            <p>
              <strong>Campaign name:</strong> {state.campaignName}
            </p>
            <p>
              <strong>Daily budget:</strong> {state.dailyBudgetEuros.toFixed(2)} €
            </p>
            {state.spendCapEuros !== undefined && (
              <p>
                <strong>Spend cap:</strong> {state.spendCapEuros.toFixed(2)} €
              </p>
            )}
            <p>
              <strong>Ad sets:</strong> {state.adSets.map((s) => s.name).join(", ") || "—"}
            </p>
          </div>
          <p className="text-ink-500">
            Everything is created paused. Nothing spends money until you switch it on in the
            campaigns table.
          </p>
          <Button onPress={onCreate} isPending={pending}>
            {pending ? "Creating…" : "Create (paused)"}
          </Button>

          {result.error && (
            <Alert status="danger">
              <Alert.Content>
                <Alert.Title>Could not create the campaign</Alert.Title>
                <Alert.Description>{label(result.error)}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {result.receipt && (
            <Alert status={result.error ? "warning" : "success"}>
              <Alert.Content>
                <Alert.Title>
                  Campaign {result.receipt.campaignId ?? "created"} — {result.receipt.adSets.length}{" "}
                  ad set(s)
                </Alert.Title>
                <Alert.Description>
                  {result.receipt.adSets.map((s) => `${s.name}: ${s.adIds.length} ad(s)`).join(", ")}
                  {result.receipt.failed.length > 0 &&
                    ` — ${result.receipt.failed.length} file(s) failed`}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {result.checks && (
            <ul className="space-y-1">
              {result.checks.map((c) => (
                <li key={c.label} className={c.ok ? "text-success" : "text-danger"}>
                  {c.ok ? "✓" : "✗"} {c.label}
                  {c.detail ? ` — ${label(c.detail)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Tabs.Panel>
      </Tabs>
    </Card>
  );
}
