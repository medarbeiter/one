"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, TextArea, useToast } from "@astryxdesign/core";
import { Sign } from "@/theme/icons";
import { replyAction } from "./actions";

export function Composer({ threadId }: { threadId: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const send = () =>
    start(async () => {
      const r = await replyAction(threadId, text);
      if (r.error) {
        toast({ body: `Antwort nicht gesendet: ${r.error}`, type: "error" });
        return;
      }
      setText("");
      // Read-your-own-write: der Server Action-Aufruf hat schon gespeichert,
      // hier wird nur die Serverkomponente neu geholt, damit sie es zeigt.
      router.refresh();
    });

  return (
    <div className="flex items-end gap-2">
      <TextArea
        label="Antwort"
        isLabelHidden
        rows={2}
        value={text}
        onChange={setText}
        placeholder="Antworten…"
        isDisabled={pending}
        className="flex-1"
      />
      <Button
        label="Senden"
        icon={<Sign meaning="send" />}
        isDisabled={pending || !text.trim()}
        onClick={send}
      />
    </div>
  );
}
