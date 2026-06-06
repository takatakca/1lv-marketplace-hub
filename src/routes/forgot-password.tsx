import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
  head: () => ({ meta: [{ title: "Reset password — 1LV.CA" }] }),
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success("Reset link sent — check your email.");
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a secure link to set a new password."
      footer={<Link to="/login" className="font-semibold text-electric hover:underline">← Back to sign in</Link>}
    >
      {sent ? (
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
          We sent a reset link to <strong>{email}</strong>. Open it on this device to choose a new password.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-navy">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric"
            />
          </label>
          <button
            disabled={loading}
            className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
