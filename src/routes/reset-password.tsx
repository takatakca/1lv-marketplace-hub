import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({ meta: [{ title: "Secure sign in — 1LV.CA" }] }),
});

function ResetPassword() {
  return (
    <AuthShell
      title="Password reset is no longer used"
      subtitle="1LV authentication is controlled by GROUPE TAKATAK."
      footer={
        <Link
          to="/login"
          className="font-semibold text-electric hover:underline"
        >
          ← Back to secure sign in
        </Link>
      }
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          For security and identity isolation, this route cannot change a
          local 1LV password.
        </p>
        <p>
          Use the verified-phone sign-in flow. GROUPE TAKATAK authenticates
          the identity; 1LV then creates only its own local marketplace
          session.
        </p>
        <Link
          to="/login"
          className="inline-flex w-full items-center justify-center rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90"
        >
          Continue to secure sign in
        </Link>
      </div>
    </AuthShell>
  );
}
