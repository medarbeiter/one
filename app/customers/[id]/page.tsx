import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@heroui/styles";
import { Alert, Card, Chip } from "@heroui/react";
import { findCustomer, listCustomers } from "@/lib/customers";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { customers } = await listCustomers();
  const c = findCustomer(customers, id);
  if (!c) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-ink-900 text-2xl">{c.name}</h1>
        <Chip size="sm">{c.access === "own" ? "Own" : "Client"}</Chip>
      </div>

      {c.issues.length > 0 && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>Missing access</Alert.Title>
            <Alert.Description>
              {c.issues.join(" · ")} — run <code>bun run assign</code> after granting access in
              Business Manager.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="flex gap-2">
        <Link href={`/inbox?customer=${c.id}`} className={buttonVariants()}>
          Open inbox
        </Link>
        <Link
          href={`/campaigns?customer=${c.id}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Campaigns
        </Link>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>Assets</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-2 text-sm">
          <Asset label="Page" name={c.page?.name} id={c.page?.id} />
          <Asset label="Instagram" id={c.igId} />
          {c.adAccounts.map((a) => (
            <Asset key={a.id} label="Ad account" name={`${a.name} · ${a.currency}`} id={a.id} />
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}

function Asset({ label, name, id }: { label: string; name?: string; id?: string }) {
  return (
    <div className="border-line flex items-baseline gap-3 border-b pb-2 last:border-0">
      <span className="text-ink-500 w-28 shrink-0 text-xs">{label}</span>
      <span className="flex-1">{name ?? "—"}</span>
      <code className="text-ink-500 text-xs">{id ?? "—"}</code>
    </div>
  );
}
