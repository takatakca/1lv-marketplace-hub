import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function passwordStrength(pw: string): { score: number; label: string; tone: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  const map = [
    { label: "Too short", tone: "bg-destructive" },
    { label: "Weak", tone: "bg-destructive" },
    { label: "Fair", tone: "bg-deal" },
    { label: "Good", tone: "bg-electric" },
    { label: "Strong", tone: "bg-emerald-500" },
    { label: "Excellent", tone: "bg-emerald-600" },
  ];
  return { score, ...map[score] };
}

export function PasswordField({
  value,
  onChange,
  label = "Password",
  required = true,
  minLength = 8,
  showStrength = false,
  autoComplete = "current-password",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
  minLength?: number;
  showStrength?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const s = passwordStrength(value);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-navy">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 pr-10 text-sm outline-none focus:border-electric"
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-navy"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div className="mt-1.5">
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i < s.score ? s.tone : "bg-muted"}`}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Strength: <span className="font-semibold text-navy">{s.label}</span> · use 8+ chars with a number and symbol
          </p>
        </div>
      )}
    </label>
  );
}
