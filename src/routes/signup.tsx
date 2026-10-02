import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  requestTakatakPhoneLoginCode,
  verifyTakatakPhoneLoginCode,
} from "@/lib/takatak-auth.functions";
import { formatCanadianPhone } from "./login";

export const Route = createFileRoute("/signup")({
  component: Signup,
  head: () => ({ meta: [{ title: "Create your account — 1LV.CA" }] }),
});

function Signup() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [stage, setStage] = useState<"details" | "code">("details");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const formatted = formatCanadianPhone(phone);

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const cleanName = name.trim();

    if (!cleanName) {
      toast.error("Enter your full name.");
      return;
    }
    if (!formatted) {
      toast.error("Enter a valid Canadian mobile number.");
      return;
    }
    if (!terms) {
      toast.error("Please accept the terms and privacy policy.");
      return;
    }

    setLoading(true);
    const result = await requestTakatakPhoneLoginCode({
      data: {
        phone: formatted,
        fullName: cleanName,
      },
    });
    setLoading(false);

    if (!result.ok) {
      toast.error(
        result.setupRequired
          ? "Secure account verification is temporarily unavailable."
          : result.error,
      );
      return;
    }

    setStage("code");
    toast.success("Verification code sent.");
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !formatted || code.length !== 6) return;

    setLoading(true);
    const result = await verifyTakatakPhoneLoginCode({
      data: {
        phone: formatted,
        code,
        intent: "signup",
        termsAccepted: terms,
        marketingOptIn: marketing,
      },
    });

    if (!result.ok) {
      setLoading(false);
      toast.error(
        result.setupRequired
          ? "Secure account verification is temporarily unavailable."
          : result.error,
      );
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: result.tokenHash,
    });
    setLoading(false);

    if (error) {
      toast.error(
        "Your identity was verified, but the local 1LV session could not start.",
      );
      return;
    }

    toast.success("Account verified securely");
    nav({ to: "/role-select" });
  };

  return (
    <AuthShell
      title="Create your 1LV.CA account"
      subtitle="One verified GROUPE TAKATAK identity, one private 1LV marketplace profile."
      footer={
        <>
          Already a member?{" "}
          <Link to="/login" className="font-semibold text-electric hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {stage === "details" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            GROUPE TAKATAK verifies your master identity. 1LV receives only the
            identity information authorized for this marketplace and keeps its
            business data separate from every other company.
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-navy">
              Full name
            </span>
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-navy">
              Mobile number
            </span>
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric"
            />
            {phone && !formatted && (
              <p className="mt-1 text-[11px] text-destructive">
                Enter a valid Canadian number (10 digits, or starting with +1).
              </p>
            )}
          </label>

          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              required
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-electric"
            />
            <span className="text-muted-foreground">
              I agree to the{" "}
              <Link to="/terms" className="font-semibold text-electric hover:underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="font-semibold text-electric hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(event) => setMarketing(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-electric"
            />
            <span className="text-muted-foreground">
              Send me 1LV deals, coupons, and new arrivals. I can opt out later.
            </span>
          </label>

          <button
            disabled={loading || !formatted || !terms}
            className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Verify phone & create account"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            A GROUPE TAKATAK verification code was sent to{" "}
            <strong>{formatted}</strong>.
          </div>

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
            {loading ? "Verifying…" : "Verify & continue"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setStage("details");
              setCode("");
            }}
            className="w-full text-xs font-semibold text-muted-foreground hover:text-navy"
          >
            ← Change account details
          </button>
        </form>
      )}
    </AuthShell>
  );
}
