"use client";

import { useActionState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  TextField,
  TextArea,
} from "@heroui/react";
import { launchAction, type LaunchResult } from "./actions";

const field =
  "border-default-300 bg-surface h-10 w-full rounded-lg border px-3 text-sm";

// ponytail: natives <select> statt HeroUI-Select – FormData kommt so ohne State aus.
function Choice({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: string[];
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select name={name} className={field} defaultValue={options[0]}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// defaultValue gehört an TextField – auf dem Input hält RAC ihn für "controlled".
function Text({
  name,
  label,
  defaultValue,
  ...rest
}: {
  name: string;
  label: string;
  defaultValue?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <TextField
      name={name}
      defaultValue={defaultValue}
      isRequired
      className="space-y-1"
    >
      <Label>{label}</Label>
      <Input {...rest} />
    </TextField>
  );
}

export function LaunchForm({
  adAccount,
  pages,
}: {
  adAccount: string;
  pages: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<LaunchResult, FormData>(
    launchAction,
    {},
  );

  return (
    <Card>
      <Card.Header>
        <Card.Title>Neue Kampagne</Card.Title>
        <Card.Description>
          Legt Kampagne, Anzeigengruppe und je eine Anzeige pro Datei an – alles
          PAUSIERT.
        </Card.Description>
      </Card.Header>
      <form action={action}>
        <input type="hidden" name="adAccount" value={adAccount} />
        <Card.Content className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Seite (Kunde)</Label>
            <select name="pageId" className={field} required>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Text
            name="name"
            label="Kampagnenname"
            defaultValue="Pflegekräfte Sachsen"
          />
          <Text
            name="dailyBudget"
            label="Tagesbudget (€)"
            type="number"
            step="0.01"
            defaultValue="20"
          />
          <Choice
            name="objective"
            label="Ziel"
            options={[
              "OUTCOME_TRAFFIC",
              "OUTCOME_LEADS",
              "OUTCOME_ENGAGEMENT",
              "OUTCOME_AWARENESS",
              "OUTCOME_SALES",
            ]}
          />
          <Choice
            name="optimizationGoal"
            label="Optimierung"
            options={[
              "LINK_CLICKS",
              "LANDING_PAGE_VIEWS",
              "OFFSITE_CONVERSIONS",
              "LEAD_GENERATION",
              "REACH",
            ]}
          />
          <Text
            name="countries"
            label="Länder (ISO, kommasepariert)"
            defaultValue="DE"
          />
          <div className="grid grid-cols-2 gap-2">
            <Text
              name="ageMin"
              label="Alter ab"
              type="number"
              defaultValue="18"
            />
            <Text
              name="ageMax"
              label="Alter bis"
              type="number"
              defaultValue="65"
            />
          </div>
          <Text
            name="link"
            label="Ziel-URL"
            type="url"
            defaultValue="https://medarbeiter.de"
          />
          <Choice
            name="callToAction"
            label="Button"
            options={[
              "APPLY_NOW",
              "LEARN_MORE",
              "SIGN_UP",
              "CONTACT_US",
              "SEND_MESSAGE",
            ]}
          />
          <Text
            name="headline"
            label="Überschrift"
            defaultValue="Jetzt bewerben"
          />

          <TextField
            name="message"
            defaultValue="Wir suchen Pflegekräfte – flexibel, fair bezahlt."
            isRequired
            className="space-y-1 sm:col-span-2"
          >
            <Label>Anzeigentext</Label>
            <TextArea rows={3} />
          </TextField>

          <div className="space-y-1 sm:col-span-2">
            <Label>Videos / Bilder</Label>
            <input
              type="file"
              name="files"
              multiple
              accept="image/*,video/*"
              className={`${field} py-2`}
            />
            <p className="text-default-500 text-xs">
              Pro Datei entsteht eine eigene Anzeige.
            </p>
          </div>

          <Checkbox
            name="specialAdCategories"
            value="EMPLOYMENT"
            defaultSelected
            className="sm:col-span-2"
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              Sonderkategorie „Beschäftigung“ – Pflicht bei Stellenanzeigen,
              deaktiviert Alters-Targeting
            </Checkbox.Content>
          </Checkbox>
        </Card.Content>
        <Card.Footer className="flex items-center gap-3">
          <Button type="submit" isPending={pending}>
            {pending ? "Lädt hoch …" : "Anlegen (pausiert)"}
          </Button>
          {state.ok && <span className="text-success text-sm">{state.ok}</span>}
          {state.error && (
            <span className="text-danger text-sm">{state.error}</span>
          )}
        </Card.Footer>
      </form>
    </Card>
  );
}
