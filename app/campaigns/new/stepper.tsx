"use client";

import { useActionState, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Slider,
  Tabs,
  TextArea,
  TextField,
} from "@heroui/react";
import { launchAction, type LaunchResult } from "../actions";

type Customer = { id: string; name: string; adAccounts: { id: string; name: string }[] };

const field = "border-line bg-surface h-10 w-full rounded-md border px-3 text-sm";

const STEPS = ["Customer & objective", "Audience", "Creatives", "Review"];

function Choice({ name, label, options, ...rest }: {
  name: string; label: string; options: string[];
} & React.ComponentProps<"select">) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select name={name} className={field} defaultValue={options[0]} {...rest}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

// defaultValue gehört an TextField – auf dem Input hält RAC ihn für "controlled".
function Text({ name, label, defaultValue, ...rest }: {
  name: string; label: string; defaultValue?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <TextField name={name} defaultValue={defaultValue} isRequired className="space-y-1">
      <Label>{label}</Label>
      <Input {...rest} />
    </TextField>
  );
}

export function Stepper({ customers, defaultCustomer }: {
  customers: Customer[];
  defaultCustomer?: string;
}) {
  const [state, action, pending] = useActionState<LaunchResult, FormData>(launchAction, {});
  const [step, setStep] = useState("0");
  // Beschäftigung/Wohnen/Kredit verbieten Alters-Targeting. Deshalb steht die
  // Kategorie in Schritt 1 – sie entscheidet, was Schritt 2 überhaupt anbietet.
  const [employment, setEmployment] = useState(true);
  const [headline, setHeadline] = useState("Apply now");
  const [message, setMessage] = useState("We are hiring carers — flexible hours, fair pay.");

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
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
              <Label>Customer</Label>
              <select name="customer" className={field} defaultValue={defaultCustomer} required>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Text name="name" label="Campaign name" defaultValue="Carers Saxony" />
            <Choice name="objective" label="Objective" options={[
              "OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
              "OUTCOME_AWARENESS", "OUTCOME_SALES",
            ]} />
            <Checkbox
              name="specialAdCategories"
              value="EMPLOYMENT"
              isSelected={employment}
              onChange={setEmployment}
              className="sm:col-span-2"
            >
              <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
              <Checkbox.Content>
                Special category “Employment” — required for job ads. Disables age and gender
                targeting in the next step.
              </Checkbox.Content>
            </Checkbox>
          </Tabs.Panel>

          <Tabs.Panel id="1" className="grid gap-4 p-4 sm:grid-cols-2">
            <Text name="countries" label="Countries (ISO, comma separated)" defaultValue="DE" />
            <Choice name="optimizationGoal" label="Optimisation" options={[
              "LEAD_GENERATION", "LINK_CLICKS", "LANDING_PAGE_VIEWS",
              "OFFSITE_CONVERSIONS", "REACH",
            ]} />
            <Text name="dailyBudget" label="Daily budget (€)" type="number" step="0.01" defaultValue="20" />
            {employment ? (
              <p className="text-ink-500 self-end text-xs sm:col-span-2">
                Age targeting is unavailable for employment ads — Meta enforces 18–65 for all.
              </p>
            ) : (
              <div className="space-y-1 sm:col-span-2">
                <Label>Age range</Label>
                <Slider defaultValue={[18, 65]} minValue={13} maxValue={65} step={1}>
                  <Slider.Track><Slider.Fill /><Slider.Thumb index={0} /><Slider.Thumb index={1} /></Slider.Track>
                </Slider>
                <input type="hidden" name="ageMin" value="18" />
                <input type="hidden" name="ageMax" value="65" />
              </div>
            )}
          </Tabs.Panel>

          <Tabs.Panel id="2" className="grid gap-4 p-4 sm:grid-cols-2">
            <Text name="link" label="Destination URL" type="url" defaultValue="https://med-arbeiter.de" />
            <Choice name="callToAction" label="Button" options={[
              "APPLY_NOW", "LEARN_MORE", "SIGN_UP", "CONTACT_US", "SEND_MESSAGE",
            ]} />
            <TextField name="headline" value={headline} onChange={setHeadline} isRequired className="space-y-1">
              <Label>Headline</Label>
              <Input />
            </TextField>
            <TextField name="message" value={message} onChange={setMessage} isRequired className="space-y-1 sm:col-span-2">
              <Label>Primary text</Label>
              <TextArea rows={3} />
            </TextField>
            <div className="space-y-1 sm:col-span-2">
              <Label>Images / videos</Label>
              <input type="file" name="files" multiple accept="image/*,video/*" className={`${field} py-2`} />
              <p className="text-ink-500 text-xs">One ad is created per file.</p>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="3" className="space-y-3 p-4 text-sm">
            <p className="text-ink-500">
              Everything is created paused. Nothing spends money until you switch it on in the
              campaigns table.
            </p>
            <Button type="submit" isPending={pending}>
              {pending ? "Uploading…" : "Create (paused)"}
            </Button>
            {state.ok && <p className="text-success">{state.ok}</p>}
            {state.error && <p className="text-danger">{state.error}</p>}
          </Tabs.Panel>
        </Tabs>
      </Card>

      {/* Vorschau steht neben dem Formular, nicht dahinter – der Text wird
          für sie geschrieben, nicht für die Felder. */}
      <Card className="h-fit">
        <Card.Header><Card.Title>Preview</Card.Title></Card.Header>
        <Card.Content className="space-y-2 text-sm">
          <div className="bg-canvas border-line grid h-40 place-items-center rounded-md border text-xs text-ink-300">
            Your image or video
          </div>
          <p className="whitespace-pre-wrap">{message}</p>
          <p className="text-ink-900 font-medium">{headline}</p>
        </Card.Content>
      </Card>
    </form>
  );
}
