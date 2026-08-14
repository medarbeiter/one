"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@heroui/styles";
import { Icon } from "./icons";

/** Die Primäraktion der App, in jeder Ansicht an derselben Stelle. */
export function NewCampaign() {
  const customer = useSearchParams().get("customer");

  return (
    <Link
      href={`/campaigns/new${customer ? `?customer=${customer}` : ""}`}
      className={buttonVariants({ size: "sm" })}
    >
      <Icon name="plus" />
      Neue Kampagne
    </Link>
  );
}
