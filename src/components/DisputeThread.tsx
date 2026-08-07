import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listDisputeMessages,
  sendDisputeMessage,
  type DisputeMessageRecord,
} from "@/services/disputes";

/**
 * Shared dispute conversation. Internal admin notes are filtered server-side by
 * RLS, so customers and vendors simply never receive them.
 */
export function DisputeThread({
  disputeId,
  allowInternal = false,
  placeholder = "Write a reply…",
  disabled = false,
}: {
  disputeId: string;
  allowInternal?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<DisputeMessageRecord[]>([]);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    listDisputeMessages(disputeId).then(setMessages).catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const res = await sendDisputeMessage(disputeId, text, allowInternal && internal);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.reason ?? "Could not send message");
      return;
    }
    setText("");
    toast.success(internal ? "Internal note added" : "Message sent");
    load();
  };

  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-md border p-2 text-sm ${
                m.internal_only
                  ? "border-deal/40 bg-deal/5"
                  : "border-border bg-white"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {m.sender_role}
                {m.internal_only ? " · internal note" : ""} ·{" "}
                {new Date(m.created_at).toLocaleString("en-CA")}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-navy">{m.message}</p>
            </div>
          ))
        )}
      </div>

      {!disabled && (
        <div className="space-y-2">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            placeholder={placeholder}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-3">
            {allowInternal && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal admin note (hidden from customer &amp; vendor)
              </label>
            )}
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              className="ml-auto rounded-md bg-electric px-3 py-2 text-xs font-semibold text-electric-foreground disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
