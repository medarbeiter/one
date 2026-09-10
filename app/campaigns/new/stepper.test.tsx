import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Stepper } from "./stepper";

test("campaign steps announce progress, blocked steps and unresolved issues", () => {
  const steps = [{ label: "Auftrag", issues: 0 }, { label: "Vorschlag", issues: 2 }, { label: "Anlegen", issues: 0 }];
  const locked = renderToStaticMarkup(<Stepper steps={steps} current={0} lockedFrom={1} onSelect={() => {}} />);
  expect(locked.match(/disabled=""/g)).toHaveLength(2);
  expect(locked.match(/aria-current="step"/g)).toHaveLength(1);
  expect(locked).toContain("Schritt 2 von 3: Vorschlag, Noch gesperrt");
  const review = renderToStaticMarkup(<Stepper steps={steps} current={2} onSelect={() => {}} />);
  expect(review).toContain('data-state="done"');
  expect(review).toContain("Schritt 2 von 3: Vorschlag, 2 Punkte offen");
  expect(review).not.toContain('disabled=""');
});
