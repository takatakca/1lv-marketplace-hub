import type { User } from "@supabase/supabase-js";

/** Preview mode = no authenticated user. Dashboards still render with seed data. */
export function isDemoMode(user: User | null | undefined) {
  return !user;
}

export function shouldUseDemoData(user: User | null | undefined, hasRealData: boolean) {
  return isDemoMode(user) || !hasRealData;
}
