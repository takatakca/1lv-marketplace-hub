import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { seoHead } from "@/seo/head";

export const Route = createFileRoute("/admin")({
  head: () => seoHead({ noindex: true }),
  component: () => (
    <ProtectedRoute role="admin">
      <DashboardLayout kind="admin" />
    </ProtectedRoute>
  ),
});
