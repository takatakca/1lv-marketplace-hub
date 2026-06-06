import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c3 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.7 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 12.5 24 12.5c3 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29.1 4.5 24 4.5c-7.4 0-13.7 4.1-17.7 10.2z" />
      <path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.9 13-5l-6-5.1c-2 1.4-4.4 2.1-7 2.1-5.2 0-9.6-3.1-11.3-7.5l-6.5 5C9.9 39.2 16.4 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.5l6 5.1c-.4.4 6.5-4.7 6.5-14.6 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export function SocialAuthButtons({ next = "/account" }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  const onGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${next}` },
      });
      if (error) {
        if (/provider is not enabled/i.test(error.message)) {
          toast.error("Google sign-in not enabled yet. See docs/AUTH_SETUP.md to configure.");
        } else {
          toast.error(error.message);
        }
        setLoading(false);
      }
    } catch (e) {
      toast.error("Unable to start Google sign-in.");
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onGoogle}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:bg-muted disabled:opacity-60"
    >
      <GoogleIcon />
      {loading ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
