"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@astryxdesign/core";
import { Icon } from "./icons";

/** Die Primäraktion der App, in jeder Ansicht an derselben Stelle. */
export function NewCampaign() {
  const customer = useSearchParams().get("customer");

  return (
    <Button
      href={`/campaigns/new${customer ? `?customer=${customer}` : ""}`}
      as={Link}
      variant="primary"
      size="sm"
      icon={<Icon name="plus" />}
      label="Neue Kampagne"
    />
  );
}
