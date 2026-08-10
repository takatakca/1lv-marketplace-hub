import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";

type Props = {
  src?: string | null;
  alt: string;
  className?: string;
  /** enables desktop hover zoom when the parent has `group` */
  zoom?: boolean;
  eager?: boolean;
};

/**
 * Marketplace image primitive: fixed ratio via parent, shimmer skeleton,
 * fade-in on load, graceful fallback and lazy loading by default.
 */
export function ProductImage({ src, alt, className = "", zoom = true, eager = false }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Images already complete before hydration never fire onLoad.
  useEffect(() => {
    const el = ref.current;
    if (el?.complete) {
      if (el.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, [src]);


  if (!src || failed) {
    return (
      <div className={`grid h-full w-full place-items-center bg-muted text-muted-foreground ${className}`}>
        <ImageOff size={20} aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    <>
      {!loaded && <div className="absolute inset-0 skeleton-shimmer" aria-hidden />}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${zoom ? "group-hover:scale-[1.06]" : ""} ${className}`}
      />
    </>
  );
}
