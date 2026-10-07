import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { seoHead } from "@/seo/head";

export const Route = createFileRoute("/vendor")({
  head: () => seoHead({ noindex: true }),
  component: () => (
    <ProtectedRoute role="vendor">
      <DashboardLayout kind="vendor" />
    </ProtectedRoute>
  ),
});
