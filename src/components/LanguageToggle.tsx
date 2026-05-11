import { Globe } from "lucide-react";
import { useEffect, useState } from "react";

export function LanguageToggle() {
  const [lang, setLang] = useState<"EN" | "FR">("EN");
  useEffect(() => {
    const v = (typeof window !== "undefined" && localStorage.getItem("1lvca:lang")) as "EN" | "FR" | null;
    if (v) setLang(v);
  }, []);
  const next = () => {
    const n = lang === "EN" ? "FR" : "EN";
    setLang(n);
    if (typeof window !== "undefined") localStorage.setItem("1lvca:lang", n);
  };
  return (
    <button
      onClick={next}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-navy hover:bg-muted"
      aria-label="Toggle language"
    >
      <Globe size={15} /> {lang}
    </button>
  );
}
