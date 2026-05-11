import { Star } from "lucide-react";

export function RatingStars({ rating, reviews, size = 14 }: { rating: number; reviews?: number; size?: number }) {
  const full = Math.floor(rating);
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <div className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={size}
            className={i < full ? "fill-deal text-deal" : "text-border"}
            strokeWidth={1.5}
          />
        ))}
      </div>
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      {reviews !== undefined && <span>({reviews.toLocaleString()})</span>}
    </div>
  );
}
