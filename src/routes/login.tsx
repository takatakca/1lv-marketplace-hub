import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login, head: () => ({ meta: [{ title: "Sign in — 1LV.CA" }] }) });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  if (user) { nav({ to: "/account" }); }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back");
    nav({ to: "/account" });
  };

  return (
    <AppLayout>
      <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
        <div className="w-full">
          <div className="text-center"><Logo /></div>
          <h1 className="mt-6 text-center font-display text-2xl font-extrabold text-navy">Sign in to 1LV.CA</h1>
          <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-6 shadow-card">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-navy">Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-navy">Password</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric" />
            </label>
            <button disabled={loading} className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60">
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              No account? <Link to="/signup" className="font-semibold text-electric hover:underline">Create one</Link>
            </p>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
