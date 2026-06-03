import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { resolveAssetUrl, uploadVendorAsset, validateImageFile, type VendorAssetKind } from "@/services/vendor-assets";

type Props = {
  kind: VendorAssetKind;
  label: string;
  userId?: string | null;
  value: string | null;
  onChange: (path: string | null) => void;
  aspect?: "square" | "banner";
  disabled?: boolean;
};

export function VendorAssetUpload({ kind, label, userId, value, onChange, aspect = "square", disabled }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    resolveAssetUrl(value).then((u) => { if (mounted) setUrl(u); });
    return () => { mounted = false; };
  }, [value]);

  const pick = () => inputRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateImageFile(f);
    if (err) { toast.error(err); return; }
    if (!userId) {
      // demo mode: preview locally only
      const local = URL.createObjectURL(f);
      setUrl(local);
      toast.success(`${label} uploaded (demo)`);
      return;
    }
    setBusy(true);
    try {
      const path = await uploadVendorAsset(userId, kind, f);
      onChange(path);
      toast.success(`${label} updated`);
    } catch (er) { toast.error((er as Error).message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const clear = () => { onChange(null); setUrl(null); };

  const ratio = aspect === "banner" ? "aspect-[4/1]" : "aspect-square";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-navy">{label}</span>
        {url && !disabled && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
            <X size={12} /> Remove
          </button>
        )}
      </div>
      <div className={`group relative overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 ${ratio}`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            <div className="flex flex-col items-center gap-1">
              <ImageIcon size={20} />
              <span>No {label.toLowerCase()} yet</span>
            </div>
          </div>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-navy/90 px-3 py-1.5 text-xs font-semibold text-white opacity-90 hover:bg-navy disabled:opacity-50"
          >
            <Upload size={12} /> {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />
      <p className="mt-1 text-[11px] text-muted-foreground">PNG/JPG/WEBP/GIF · max 4MB</p>
    </div>
  );
}
