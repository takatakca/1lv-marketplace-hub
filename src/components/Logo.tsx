import { Link } from "@tanstack/react-router";

export function Logo({ className = "", variant = "default" }: { className?: string; variant?: "default" | "light" }) {
  const colorWord = variant === "light" ? "text-white" : "text-navy";
  const colorAccent = "text-electric";
  return (
    <Link to="/" className={`group inline-flex items-center gap-1.5 font-display font-extrabold tracking-tight ${className}`}>
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-md bg-gradient-electric text-white shadow-glow">
        <span className="text-sm font-black">1</span>
      </span>
      <span className={`text-xl ${colorWord}`}>
        LV<span className={colorAccent}>.</span>CA
      </span>
    </Link>
  );
}
