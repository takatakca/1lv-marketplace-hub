import { Link } from "@tanstack/react-router";
import { categories as demoCategoryMeta } from "@/lib/data";
import { usePublicCategories } from "@/hooks/use-public-categories";

export function CategoryMegaMenu({ open }: { open: boolean }) {
  const { categories, demo } = usePublicCategories();
  if (!open) return null;

  const rootCategories = categories.filter(
    (category) => category.parent_slug === null,
  );
  const displayCategories =
    rootCategories.length > 0 ? rootCategories : categories;

  return (
    <div className="absolute left-0 right-0 top-full z-40 hidden border-t border-border bg-white shadow-elevated md:block">
      <div className="mx-auto grid max-w-7xl grid-cols-4 gap-6 px-6 py-6 lg:grid-cols-5">
        {displayCategories.map((category) => {
          const meta = demoCategoryMeta.find(
            (item) => item.slug === category.slug,
          );
          const children = demo && meta
            ? meta.subcategories.map((name) => ({
                slug: category.slug,
                name,
              }))
            : categories
                .filter((item) => item.parent_slug === category.slug)
                .map((item) => ({
                  slug: item.slug,
                  name: item.name_en,
                }));

          return (
            <div key={category.slug}>
              <Link
                to="/category/$slug"
                params={{ slug: category.slug }}
                className="flex items-center gap-2 text-sm font-bold text-navy hover:text-electric"
              >
                <span aria-hidden>{meta?.emoji ?? "📦"}</span>{" "}
                {category.name_en}
              </Link>
              {children.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {children.map((child) => (
                    <li key={child.slug + child.name}>
                      <Link
                        to="/category/$slug"
                        params={{ slug: child.slug }}
                        className="text-xs text-muted-foreground hover:text-electric"
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
