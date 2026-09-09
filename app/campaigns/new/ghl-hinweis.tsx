import { Banner, Link } from "@astryxdesign/core";

/**
 * Ein Meta-Formular liefert erst dann Kontakte, wenn seine Felder in
 * GoHighLevel (app.medarbeiter.ai) zugeordnet sind – bei jedem neu gebauten
 * und jedem neu gewählten Formular. Das kann nur ein Mensch klicken: GHL kennt
 * keinen Deep-Link ohne Location-ID, und die hat One nicht.
 */
export function GhlHinweis({ formName }: { formName?: string }) {
  return (
    <Banner
      status="info"
      title="Formularfelder in GoHighLevel zuordnen"
      description={
        <>
          {formName ? `„${formName}“` : "Das Formular"} muss noch in{" "}
          <Link href="https://app.medarbeiter.ai" target="_blank" rel="noreferrer">
            app.medarbeiter.ai
          </Link>{" "}
          gemappt werden: Subaccount des Kunden → Einstellungen → Integrationen → Facebook → Form
          Field Mapping → „Map Fields“ neben dem Formular.
        </>
      }
    />
  );
}
