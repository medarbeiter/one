import { Card, Table } from "@heroui/react";
import { redirect } from "next/navigation";
import { actId, listCampaigns, meta } from "@/lib/meta";
import { listAssets } from "@/lib/customers";
import { Setup } from "../setup";
import { LaunchForm } from "./launch-form";

export default async function CampaignsPage({
  searchParams,
}: PageProps<"/campaigns">) {
  const act = (await searchParams).act;
  const adAccount = actId(typeof act === "string" ? act : meta.adAccount);
  // Ohne Konto gibt es nichts zu zeigen – auf der Übersicht eins auswählen.
  if (!adAccount) redirect("/");

  let campaigns;
  let pages: { id: string; name: string }[] = [];
  let error;
  try {
    [campaigns, pages] = await Promise.all([
      listCampaigns(adAccount).then((r) => r.data),
      listAssets().then((a) => a.pages),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) return <Setup error={error} />;

  return (
    <div className="space-y-6">
      <LaunchForm adAccount={adAccount} pages={pages} />
      <Card>
        <Card.Header>
          <Card.Title>Kampagnen</Card.Title>
          <Card.Description className="font-mono">{adAccount}</Card.Description>
        </Card.Header>
        <Card.Content>
          <Table>
            <Table.Content aria-label="Kampagnen">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column>Ziel</Table.Column>
                <Table.Column>Status</Table.Column>
              </Table.Header>
              <Table.Body>
                {(campaigns ?? []).map((c) => (
                  <Table.Row key={c.id} id={c.id}>
                    <Table.Cell>{c.name}</Table.Cell>
                    <Table.Cell>{c.objective}</Table.Cell>
                    <Table.Cell>{c.status}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table>
        </Card.Content>
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";
