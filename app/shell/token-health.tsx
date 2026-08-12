import { Popover } from "@heroui/react";

const COPY = {
  ok: { dot: "bg-success", title: "Connected", body: "The system user token is working." },
  degraded: {
    dot: "bg-danger",
    title: "Partly connected",
    body: "Some assets are not assigned to the system user. Grant access in Business Manager, then run `bun run assign`.",
  },
  dead: {
    dot: "bg-danger",
    title: "Not connected",
    body: "Create a system user token in Business Manager and put it into .env.local as META_ACCESS_TOKEN. Steps are in the README.",
  },
} as const;

export function TokenHealth({
  state,
  detail,
}: {
  state: keyof typeof COPY;
  detail: string[];
}) {
  const c = COPY[state];
  return (
    <Popover>
      <Popover.Trigger
        aria-label={`Connection: ${c.title}`}
        className="border-line hover:bg-canvas flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
      >
        <span className={`size-2 rounded-full ${c.dot}`} />
        {c.title}
      </Popover.Trigger>
      <Popover.Content className="max-w-80">
        {/* Popover.Dialog liefert role="dialog", die Titel-Verknüpfung (aria-labelledby) und
            Escape-to-close – ohne dieses Sub-Part fehlt die Aria-Semantik. */}
        <Popover.Dialog className="space-y-2 text-sm">
          <Popover.Heading>{c.title}</Popover.Heading>
          <p className="text-ink-500 text-xs">{c.body}</p>
          {detail.length > 0 && (
            <ul className="text-ink-500 list-disc space-y-1 pl-4 text-xs">
              {detail.slice(0, 8).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
