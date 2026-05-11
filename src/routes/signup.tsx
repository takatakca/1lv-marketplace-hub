import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: Signup, head: () => ({ meta: [{ title: "Create account — 1LV.CA" }] }) });

function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/account`,
        data: { display_name: name },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created — check your email to confirm.");
    nav({ to: "/login" });
  };

  return (
    <AppLayout>
      <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
        <div className="w-full">
          <div className="text-center"><Logo /></div>
          <h1 className="mt-6 text-center font-display text-2xl font-extrabold text-navy">Create your account</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">Free forever. Shop, save and track orders.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-6 shadow-card">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-navy">Display name</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-navy">Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-navy">Password</span>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-electric" />
            </label>
            <button disabled={loading} className="w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90 disabled:opacity-60">
              {loading ? "Creating…" : "Create account"}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Already a member? <Link to="/login" className="font-semibold text-electric hover:underline">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
