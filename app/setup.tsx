import { Card } from "@heroui/react";

export function Setup({ error }: { error: string }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Noch nicht verbunden</Card.Title>
        <Card.Description>{error}</Card.Description>
      </Card.Header>
      <Card.Content className="text-default-600 space-y-2 text-sm">
        <p>
          System-User-Token im Business Manager erzeugen und in{" "}
          <code>.env.local</code> eintragen (<code>META_ACCESS_TOKEN</code>,{" "}
          <code>META_AD_ACCOUNT_ID</code>). Schritte stehen in der README.
        </p>
      </Card.Content>
    </Card>
  );
}
