import { Link } from "@tanstack/react-router";
import { categories } from "@/lib/data";

export function CategoryMegaMenu({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <div className="absolute left-0 right-0 top-full z-40 hidden border-t border-border bg-white shadow-elevated md:block">
      <div className="mx-auto grid max-w-7xl grid-cols-4 gap-6 px-6 py-6 lg:grid-cols-5">
        {categories.map((c) => (
          <div key={c.slug}>
            <Link
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="flex items-center gap-2 text-sm font-bold text-navy hover:text-electric"
            >
              <span aria-hidden>{c.emoji}</span> {c.name}
            </Link>
            <ul className="mt-2 space-y-1.5">
              {c.subcategories.map((s) => (
                <li key={s}>
                  <Link
                    to="/category/$slug"
                    params={{ slug: c.slug }}
                    className="text-xs text-muted-foreground hover:text-electric"
                  >
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
