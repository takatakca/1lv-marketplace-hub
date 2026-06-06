import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { PasswordField, passwordStrength } from "@/components/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({ meta: [{ title: "Set new password — 1LV.CA" }] }),
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (passwordStrength(password).score < 2) {
      toast.error("Choose a stronger password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated.");
    nav({ to: "/account" });
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Make it long and unique.">
      <form onSubmit={onSubmit} className="space-y-3">
        <PasswordField
          value={password}
          onChange={setPassword}
          label="New password"
          autoComplete="new-password"
          showStrength
        />
        <button
          disabled={loading}
          className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
