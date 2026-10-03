import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
  head: () => ({ meta: [{ title: "Account access — 1LV.CA" }] }),
});

function ForgotPassword() {
  return (
    <AuthShell
      title="Account access"
      subtitle="GROUPE TAKATAK is the authentication authority for 1LV.CA."
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
          1LV no longer maintains a separate account password. Sign in with
          your verified mobile number and the secure code issued by GROUPE
          TAKATAK.
        </p>
        <p>
          Your 1LV marketplace profile remains independent. Only the master
          identity and permissions authorized for 1LV are used to open your
          local session.
        </p>
        <Link
          to="/login"
          className="inline-flex w-full items-center justify-center rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground hover:opacity-90"
        >
          Sign in with verified phone
        </Link>
      </div>
    </AuthShell>
  );
}
