import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { uploadVendorImage, validateImage, type UploadKind } from "@/services/vendor-storage";

type Props = {
  kind: UploadKind;
  userId: string | null;
  value: string | null;
  onChange: (url: string | null) => void;
  demo?: boolean;
  label: string;
  aspect?: "square" | "banner";
};

export function ImageUploader({ kind, userId, value, onChange, demo, label, aspect = "square" }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => ref.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validateImage(file);
    if (v) { toast.error(v); return; }
    if (demo || !userId) {
      const url = URL.createObjectURL(file);
      onChange(url);
      toast.success(`${label} preview saved (demo)`);
      return;
    }
    setBusy(true);
    try {
      const url = await uploadVendorImage(userId, kind, file);
      onChange(url);
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally { setBusy(false); e.target.value = ""; }
  };

  const ratio = aspect === "banner" ? "aspect-[3/1]" : "aspect-square";

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-navy">{label}</span>
      <div className={`relative ${ratio} w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/30`}>
        {value ? (
          <>
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(null)} className="absolute right-2 top-2 rounded-full bg-background/90 p-1 text-foreground shadow">
              <X size={14} />
            </button>
          </>
        ) : (
          <button type="button" onClick={pick} className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Upload size={18} />
            <span>Click to upload</span>
            <span className="text-[10px]">PNG, JPG, WEBP — max 5 MB</span>
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={pick} disabled={busy} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          {busy ? "Uploading…" : value ? "Replace" : "Choose file"}
        </button>
        {demo && <span className="text-[10px] text-muted-foreground">Demo mode — preview only</span>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />
    </div>
  );
}
