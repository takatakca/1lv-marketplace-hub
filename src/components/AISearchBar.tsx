import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { Search, Mic, MicOff, X, Clock, TrendingUp, Store, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSearchIntent, intentToSearchParams } from "@/lib/search-intent";
import {
  QUICK_CHIPS,
  TRENDING_SEARCHES,
  clearRecentSearches,
  enhanceSearchIntent,
  getRecentSearches,
  getSuggestions,
  pushRecentSearch,
  type Suggestion,
} from "@/services/ai-search";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AISearchBar({
  initialQuery = "",
  compact = false,
  className,
}: {
  initialQuery?: string;
  compact?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setRecent(getRecentSearches());
    setVoiceSupported(!!getRecognitionCtor());
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const suggestions = useMemo(() => getSuggestions(q), [q]);

  const runSearch = async (raw: string) => {
    const term = raw.trim();
    setOpen(false);
    if (term) setRecent(pushRecentSearch(term));
    const intent = await enhanceSearchIntent(term);
    const params = intentToSearchParams(intent);
    navigate({ to: "/search", search: { ...params, raw: term || undefined } as any });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch(q);
  };

  const startVoice = () => {
    setVoiceError(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setVoiceError("Voice search not supported on this browser");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      const rec = new Ctor();
      recognitionRef.current = rec;
      rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-CA" : "en-CA";
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        let transcript = "";
        for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
        // Only the text transcript enters app state — no audio is recorded or stored.
        setQ(transcript.trim().slice(0, 200));
        setOpen(true);
      };
      rec.onerror = (e: any) => {
        const code = e?.error;
        setVoiceError(
          code === "not-allowed" || code === "service-not-allowed"
            ? "Microphone permission denied. Enable it in your browser settings."
            : code === "no-speech"
              ? "Didn't catch that — try again."
              : "Voice search failed. Please try again.",
        );
        setListening(false);
      };
      rec.onend = () => {
        setListening(false);
        inputRef.current?.focus();
      };
      rec.start();
      setListening(true);
      setOpen(true);
    } catch {
      setVoiceError("Voice search could not start on this browser");
      setListening(false);
    }
  };

  const preview = q.trim() ? parseSearchIntent(q) : null;
  const hasSmart =
    !!preview &&
    (preview.maxPrice !== undefined ||
      preview.minPrice !== undefined ||
      preview.freeShipping ||
      preview.canadian ||
      preview.sale ||
      preview.rating !== undefined);

  const go = (s: Suggestion) => {
    setOpen(false);
    if (s.kind === "product") navigate({ to: "/product/$slug", params: { slug: s.slug } });
    else if (s.kind === "category") navigate({ to: "/category/$slug", params: { slug: s.slug } });
    else navigate({ to: "/store/$slug", params: { slug: s.slug } });
  };

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <form onSubmit={onSubmit} role="search">
        <div
          className={cn(
            "flex w-full overflow-hidden rounded-lg border border-border bg-white focus-within:border-electric focus-within:shadow-glow",
            listening && "border-electric shadow-glow",
          )}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls="ai-search-suggestions"
            aria-label="Search products"
            placeholder={listening ? "Listening…" : compact ? "Search products…" : "Try “wireless headphones under $50 free shipping”"}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground sm:px-4 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="grid w-9 place-items-center text-muted-foreground hover:text-navy"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={startVoice}
            aria-label={listening ? "Stop voice search" : "Search by voice"}
            aria-pressed={listening}
            className={cn(
              "grid w-11 place-items-center border-l border-border text-navy hover:bg-muted",
              listening && "animate-pulse bg-electric/10 text-electric",
            )}
          >
            {voiceSupported ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <button
            type="submit"
            className="flex items-center gap-2 bg-electric px-3 text-sm font-semibold text-electric-foreground hover:opacity-90 sm:px-5"
            aria-label="Search"
          >
            <Search size={16} /> <span className="hidden sm:inline">Search</span>
          </button>
        </div>
      </form>

      {(listening || voiceError) && (
        <p className={cn("mt-1 px-1 text-xs", voiceError ? "text-deal" : "text-electric")} role="status">
          {voiceError ?? "Listening… speak now. Audio is never recorded or stored."}
        </p>
      )}

      {open && (
        <div
          id="ai-search-suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-white p-3 shadow-elevated"
        >
          {hasSmart && preview && (
            <p className="mb-2 rounded-md bg-muted px-3 py-2 text-xs text-navy">
              Smart search:{" "}
              <span className="font-semibold">
                {[
                  preview.query || "all products",
                  preview.maxPrice !== undefined ? `under $${preview.maxPrice}` : null,
                  preview.minPrice !== undefined ? `over $${preview.minPrice}` : null,
                  preview.freeShipping ? "free shipping" : null,
                  preview.canadian ? "Canadian sellers" : null,
                  preview.rating ? `${preview.rating}+ stars` : null,
                  preview.sale ? "on sale" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
          )}

          {suggestions.length > 0 && (
            <div className="mb-2">
              {suggestions.filter((s) => s.kind === "category").length > 0 && (
                <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Categories</p>
              )}
              {suggestions
                .filter((s) => s.kind === "category")
                .map((s) => (
                  <button key={s.id} type="button" onClick={() => go(s)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
                    <Tag size={14} className="text-muted-foreground" /> {s.label}
                  </button>
                ))}

              {suggestions.filter((s) => s.kind === "store").length > 0 && (
                <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stores</p>
              )}
              {suggestions
                .filter((s) => s.kind === "store")
                .map((s) => (
                  <button key={s.id} type="button" onClick={() => go(s)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
                    <Store size={14} className="text-muted-foreground" /> {s.label}
                  </button>
                ))}

              {suggestions.filter((s) => s.kind === "product").length > 0 && (
                <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Products</p>
              )}
              {suggestions
                .filter((s) => s.kind === "product")
                .map((s) => (
                  <button key={s.id} type="button" onClick={() => go(s)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
                    {"image" in s && s.image && <img src={s.image} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" />}
                    <span className="line-clamp-1 flex-1">{s.label}</span>
                    {"price" in s && <span className="text-xs font-semibold text-navy">${s.price}</span>}
                  </button>
                ))}
            </div>
          )}

          {recent.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between px-1 pb-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Recent</p>
                <button type="button" onClick={() => setRecent(clearRecentSearches())} className="text-[11px] text-muted-foreground hover:text-deal">
                  Clear
                </button>
              </div>
              {recent.map((r) => (
                <button key={r} type="button" onClick={() => void runSearch(r)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <Clock size={14} className="text-muted-foreground" /> {r}
                </button>
              ))}
            </div>
          )}

          {!q && (
            <div className="mb-2">
              <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Trending</p>
              {TRENDING_SEARCHES.map((t) => (
                <button key={t} type="button" onClick={() => void runSearch(t)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <TrendingUp size={14} className="text-muted-foreground" /> {t}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {QUICK_CHIPS.map((chip) => (
              <Link
                key={chip.label}
                to="/search"
                search={chip.search as any}
                onClick={() => setOpen(false)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-navy hover:border-electric hover:text-electric"
              >
                {chip.label}
              </Link>
            ))}
          </div>

          {!voiceSupported && (
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">Voice search not supported on this browser</p>
          )}
        </div>
      )}
    </div>
  );
}
