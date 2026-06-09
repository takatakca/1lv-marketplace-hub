import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { PasswordField } from "@/components/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: Login,
  head: () => ({ meta: [{ title: "Sign in — 1LV.CA" }] }),
});

function Login() {
  const [tab, setTab] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  if (user) nav({ to: "/account" });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back");
    nav({ to: "/account" });
  };

  return (
    <AuthShell
      title="Sign in to 1LV.CA"
      subtitle="Track orders, save favorites, and shop faster."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-semibold text-electric hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SocialAuthButtons next="/account" />
      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setTab("email")}
          className={`rounded-md py-1.5 ${tab === "email" ? "bg-white text-navy shadow-sm" : "text-muted-foreground"}`}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setTab("phone")}
          className={`rounded-md py-1.5 ${tab === "phone" ? "bg-white text-navy shadow-sm" : "text-muted-foreground"}`}
        >
          Phone (SMS)
        </button>
      </div>

      {tab === "email" ? (
        <form onSubmit={onSubmit} className="space-y-3">
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
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs font-semibold text-electric hover:underline">
              Forgot password?
            </Link>
          </div>
          <button
            disabled={loading}
            className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <PhoneLogin />
      )}
    </AuthShell>
  );
}

function PhoneLogin() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const nav = useNavigate();

  const formatted = formatCanadianPhone(phone);

  const sendCode = async () => {
    if (loading || !formatted) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    setLoading(false);
    if (error) {
      if (/phone provider/i.test(error.message) || /not enabled/i.test(error.message) || /unsupported/i.test(error.message)) {
        toast.error("Phone OTP not configured yet. See docs/AUTH_SETUP.md.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    setStage("code");
    toast.success(`Code sent to ${formatted}`);
    startCooldown();
  };

  const startCooldown = () => {
    setCooldown(30);
    const t = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone: formatted!, token: code, type: "sms" });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Signed in");
    nav({ to: "/account" });
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">Mobile number (Canada)</span>
        <input
          type="tel"
          inputMode="tel"
          placeholder="(555) 123-4567"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={stage === "code"}
          className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric disabled:bg-muted"
        />
        {phone && !formatted && (
          <p className="mt-1 text-[11px] text-destructive">Enter a valid Canadian number (10 digits, or starting with +1).</p>
        )}
        {formatted && <p className="mt-1 text-[11px] text-muted-foreground">Will send to: {formatted}</p>}
      </label>

      {stage === "phone" ? (
        <button
          type="button"
          onClick={sendCode}
          disabled={!formatted || loading}
          className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send code"}
        </button>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-navy">6-digit code</span>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-md border border-border px-3 py-2 text-center text-lg font-bold tracking-[0.4em] outline-none focus:border-electric"
            />
          </label>
          <button
            disabled={loading || code.length !== 6}
            className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify & sign in"}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => setStage("phone")} className="text-muted-foreground hover:text-navy">
              ← Change number
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={sendCode}
              className="font-semibold text-electric hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function formatCanadianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
