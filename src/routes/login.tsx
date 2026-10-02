import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  requestTakatakPhoneLoginCode,
  verifyTakatakPhoneLoginCode,
} from "@/lib/takatak-auth.functions";

export const Route = createFileRoute("/login")({
  component: Login,
  head: () => ({ meta: [{ title: "Sign in — 1LV.CA" }] }),
});

function Login() {
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) nav({ to: "/account" });
  }, [user, nav]);

  return (
    <AuthShell
      title="Sign in to 1LV.CA"
      subtitle="Secure sign-in is verified by GROUPE TAKATAK."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-semibold text-electric hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        1LV does not maintain a separate password or social-login identity.
        Your verified phone is authenticated by GROUPE TAKATAK, then 1LV opens
        only its own local marketplace session.
      </div>
      <PhoneLogin />
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

  const startCooldown = () => {
    setCooldown(30);
    const timer = window.setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    if (loading || !formatted) return;
    setLoading(true);
    const result = await requestTakatakPhoneLoginCode({
      data: { phone: formatted, intent: "login" },
    });
    setLoading(false);

    if (!result.ok) {
      toast.error(
        result.setupRequired
          ? "Secure phone verification is temporarily unavailable."
          : result.error,
      );
      return;
    }

    setStage("code");
    toast.success("Verification code sent.");
    startCooldown();
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !formatted) return;

    setLoading(true);
    const result = await verifyTakatakPhoneLoginCode({
      data: { phone: formatted, code, intent: "login" },
    });

    if (!result.ok) {
      setLoading(false);
      toast.error(
        result.setupRequired
          ? "Secure phone verification is temporarily unavailable."
          : result.error,
      );
      return;
    }

    const { error } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
    setLoading(false);

    if (error) {
      toast.error(
        "Your identity was verified, but the local 1LV session could not start.",
      );
      return;
    }

    toast.success("Signed in securely");
    nav({ to: "/account" });
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">
          Mobile number (Canada)
        </span>
        <input
          type="tel"
          inputMode="tel"
          placeholder="(555) 123-4567"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={stage === "code"}
          className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric disabled:bg-muted"
        />
        {phone && !formatted && (
          <p className="mt-1 text-[11px] text-destructive">
            Enter a valid Canadian number (10 digits, or starting with +1).
          </p>
        )}
        {formatted && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            GROUPE TAKATAK will verify {formatted}.
          </p>
        )}
      </label>

      {stage === "phone" ? (
        <button
          type="button"
          onClick={sendCode}
          disabled={!formatted || loading}
          className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send secure code"}
        </button>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-navy">
              6-digit code
            </span>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
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
            <button
              type="button"
              onClick={() => {
                setStage("phone");
                setCode("");
              }}
              className="text-muted-foreground hover:text-navy"
            >
              ← Change number
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={sendCode}
              className="font-semibold text-electric hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? "Resend in " + cooldown + "s" : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function formatCanadianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}
