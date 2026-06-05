import { useEffect, useState } from "react";

const KEY = "1lvca:recent:v1";
const MAX = 12;

export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setIds(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const push = (id: string) => {
    if (typeof window === "undefined") return;
    setIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const clear = () => {
    setIds([]);
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  };

  return { ids, push, clear };
}
