import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { PasswordField, passwordStrength } from "@/components/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCanadianPhone } from "./login";

export const Route = createFileRoute("/signup")({
  component: Signup,
  head: () => ({ meta: [{ title: "Create your account — 1LV.CA" }] }),
});

function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(true);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!terms) { toast.error("Please accept the terms to continue."); return; }
    if (passwordStrength(password).score < 2) {
      toast.error("Choose a stronger password (8+ chars, with a number).");
      return;
    }
    const fmtPhone = phone ? formatCanadianPhone(phone) : null;
    if (phone && !fmtPhone) {
      toast.error("Invalid Canadian phone number.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/role-select`,
        data: {
          display_name: name,
          phone: fmtPhone ?? undefined,
          marketing_opt_in: marketing,
        },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created — check your email to confirm.");
    nav({ to: "/role-select" });
  };

  return (
    <AuthShell
      title="Create your 1LV.CA account"
      subtitle="Shop, save, and (optionally) sell — all in one place."
      footer={
        <>
          Already a member?{" "}
          <Link to="/login" className="font-semibold text-electric hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SocialAuthButtons next="/role-select" />
      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-navy">Full name</span>
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-navy">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-navy">
            Phone <span className="font-normal text-muted-foreground">(optional, for SMS sign-in)</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric"
          />
        </label>
        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showStrength
        />

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            required
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-electric"
          />
          <span className="text-muted-foreground">
            I agree to the{" "}
            <Link to="/terms" className="font-semibold text-electric hover:underline">Terms</Link> and{" "}
            <Link to="/privacy" className="font-semibold text-electric hover:underline">Privacy Policy</Link>.
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-electric"
          />
          <span className="text-muted-foreground">
            Send me deals, coupons, and new arrivals from 1LV.CA (you can opt out anytime).
          </span>
        </label>

        <button
          disabled={loading}
          className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
