import { useEffect, useState } from "react";
import {
  getPublicMarketplaceSettings,
  type PublicMarketplaceSettings,
} from "@/lib/public-marketplace-settings.functions";

export function usePublicMarketplaceSettings() {
  const [settings, setSettings] = useState<PublicMarketplaceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getPublicMarketplaceSettings()
      .then((result) => {
        if (!active) return;
        setSettings(result);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load marketplace settings.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    settings,
    loading: settings == null && error == null,
    error,
  };
}
