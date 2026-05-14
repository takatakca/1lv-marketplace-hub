import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/vendor")({
  component: () => (
    <ProtectedRoute role="vendor">
      <DashboardLayout kind="vendor" />
    </ProtectedRoute>
  ),
});
