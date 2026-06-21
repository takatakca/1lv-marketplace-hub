type Column<T> = { key: keyof T | string; label: string; render?: (row: T) => React.ReactNode; className?: string };

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  empty = "No records found.",
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={String(c.key)} className={`px-4 py-3 ${c.className ?? ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border hover:bg-muted/30">
              {columns.map((c) => {
                const v = (r as Record<string, unknown>)[c.key as string];
                const isNode = v !== null && typeof v === "object";
                return (
                  <td key={String(c.key)} className={`px-4 py-3 ${c.className ?? ""}`}>
                    {c.render ? c.render(r) : isNode ? (v as React.ReactNode) : String(v ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
